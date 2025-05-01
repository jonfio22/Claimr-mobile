-- Live Claim Verification Engine Tables
-- These tables support the continuous monitoring and verification of claims processing

-- Primary audit table for tracking claim verification status
CREATE TABLE claim_pipeline_audits (
  audit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id TEXT NOT NULL,
  claim_version INT NOT NULL,
  audit_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verification_complete BOOLEAN NOT NULL DEFAULT FALSE,
  overall_status TEXT NOT NULL, -- 'VERIFIED', 'PARTIAL', 'FAILED'
  overall_confidence NUMERIC(5,2) NOT NULL, -- 0-100 confidence score
  requires_review BOOLEAN NOT NULL DEFAULT FALSE,
  review_reason TEXT,
  claim_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_claim_pipeline_audits_claim_id ON claim_pipeline_audits(claim_id);
CREATE INDEX idx_claim_pipeline_audits_status ON claim_pipeline_audits(overall_status);
CREATE INDEX idx_claim_pipeline_audits_requires_review ON claim_pipeline_audits(requires_review);

-- Table for tracking verification at each pipeline stage
CREATE TABLE claim_stage_verifications (
  verification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  audit_id UUID NOT NULL REFERENCES claim_pipeline_audits(audit_id),
  pipeline_stage TEXT NOT NULL, -- e.g., 'INGESTION', 'VALIDATION', 'PROCESSING'
  stage_status TEXT NOT NULL, -- 'SUCCESS', 'WARNING', 'FAILURE'
  stage_confidence NUMERIC(5,2) NOT NULL, -- 0-100 confidence score
  expected_result JSONB,
  actual_result JSONB,
  verification_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER, -- stage processing time
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_claim_stage_verifications_audit_id ON claim_stage_verifications(audit_id);
CREATE INDEX idx_claim_stage_verifications_stage_status ON claim_stage_verifications(stage_status);

-- Table for tracking tool activations during claim processing
CREATE TABLE tool_activation_audits (
  activation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  audit_id UUID NOT NULL REFERENCES claim_pipeline_audits(audit_id),
  claim_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  activation_timestamp TIMESTAMPTZ NOT NULL,
  activation_status TEXT NOT NULL, -- 'TRIGGERED', 'COMPLETED', 'FAILED', 'SKIPPED'
  result_status TEXT NOT NULL, -- 'VALID', 'INVALID', 'ERROR'
  confidence_score NUMERIC(5,2), -- tool-specific confidence
  input_parameters JSONB,
  output_result JSONB,
  error_details TEXT,
  retry_count INTEGER DEFAULT 0,
  fallback_used BOOLEAN DEFAULT FALSE,
  fallback_tool TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tool_activation_audits_audit_id ON tool_activation_audits(audit_id);
CREATE INDEX idx_tool_activation_audits_claim_id ON tool_activation_audits(claim_id);
CREATE INDEX idx_tool_activation_audits_tool_name ON tool_activation_audits(tool_name);

-- Table for tracking claims requiring manual review
CREATE TABLE claim_review_queue (
  queue_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id TEXT NOT NULL,
  audit_id UUID NOT NULL REFERENCES claim_pipeline_audits(audit_id),
  priority INTEGER NOT NULL DEFAULT 5, -- 1-10 scale (10 highest)
  status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'IN_REVIEW', 'RESOLVED'
  assigned_to TEXT,
  flagged_reason TEXT[] NOT NULL,
  confidence_score NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_claim_review_queue_status ON claim_review_queue(status);
CREATE INDEX idx_claim_review_queue_priority ON claim_review_queue(priority);

-- Function to update claim audit status based on stage verifications
CREATE OR REPLACE FUNCTION update_claim_audit_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate overall confidence and status from stage verifications
  WITH verification_stats AS (
    SELECT 
      audit_id,
      MIN(stage_confidence) as min_confidence,
      AVG(stage_confidence) as avg_confidence,
      COUNT(*) FILTER (WHERE stage_status = 'FAILURE') as failure_count
    FROM claim_stage_verifications
    WHERE audit_id = NEW.audit_id
    GROUP BY audit_id
  )
  UPDATE claim_pipeline_audits
  SET 
    overall_confidence = vs.avg_confidence,
    overall_status = CASE 
      WHEN vs.failure_count > 0 THEN 'FAILED'
      WHEN vs.min_confidence < 70 THEN 'PARTIAL' 
      ELSE 'VERIFIED'
    END,
    requires_review = (vs.failure_count > 0 OR vs.min_confidence < 50),
    review_reason = CASE 
      WHEN vs.failure_count > 0 THEN 'Stage verification failures detected'
      WHEN vs.min_confidence < 50 THEN 'Low confidence score detected'
      ELSE NULL
    END,
    updated_at = NOW()
  FROM verification_stats vs
  WHERE claim_pipeline_audits.audit_id = vs.audit_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trig_update_claim_audit_status
AFTER INSERT OR UPDATE ON claim_stage_verifications
FOR EACH ROW
EXECUTE FUNCTION update_claim_audit_status();

-- Function to automatically add to review queue when confidence is low
CREATE OR REPLACE FUNCTION add_to_review_queue()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.requires_review = TRUE AND NOT EXISTS (
    SELECT 1 FROM claim_review_queue WHERE audit_id = NEW.audit_id
  ) THEN
    INSERT INTO claim_review_queue (
      claim_id, 
      audit_id, 
      priority, 
      flagged_reason, 
      confidence_score
    )
    VALUES (
      NEW.claim_id, 
      NEW.audit_id, 
      CASE 
        WHEN NEW.overall_confidence < 30 THEN 10
        WHEN NEW.overall_confidence < 50 THEN 7
        ELSE 5
      END,
      ARRAY[NEW.review_reason],
      NEW.overall_confidence
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trig_add_to_review_queue
AFTER UPDATE OF requires_review, review_reason ON claim_pipeline_audits
FOR EACH ROW
WHEN (NEW.requires_review = TRUE)
EXECUTE FUNCTION add_to_review_queue();
