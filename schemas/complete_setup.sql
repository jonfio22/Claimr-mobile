-- Complete Claimr Database Setup
-- This script ensures all required tables exist for the application to function properly

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =======================================
-- CORE TABLES
-- =======================================

-- Create users table if it doesn't exist
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id TEXT UNIQUE,
  email TEXT UNIQUE,
  first_name TEXT,
  last_name TEXT,
  organization_id UUID,
  role TEXT DEFAULT 'user',
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create organizations table if it doesn't exist
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create claims table if it doesn't exist
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  organization_id UUID,
  title TEXT,
  description TEXT,
  status TEXT DEFAULT 'draft',
  equipment JSONB,
  attachments JSONB,
  additional_fields JSONB DEFAULT '{}'::jsonb,
  processing_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create claim_versions table if it doesn't exist
CREATE TABLE IF NOT EXISTS claim_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id TEXT NOT NULL REFERENCES claims(id),
  version INTEGER NOT NULL,
  changes JSONB,
  snapshot JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(claim_id, version)
);

-- Create attachments table if it doesn't exist
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  content_type TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  analysis_status TEXT DEFAULT 'pending',
  analysis_result JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =======================================
-- MCP (MEMORY, CONTEXT, PLANNING) TABLES
-- =======================================

-- Create memory_stream table if it doesn't exist
CREATE TABLE IF NOT EXISTS memory_stream (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_stream_entity ON memory_stream(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_memory_stream_event_type ON memory_stream(event_type);

-- Create context_store table if it doesn't exist
CREATE TABLE IF NOT EXISTS context_store (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  context_type TEXT NOT NULL,
  context_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(entity_type, entity_id, context_type)
);

-- Create anomalies table if it doesn't exist
CREATE TABLE IF NOT EXISTS anomalies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  anomaly_type TEXT NOT NULL,
  confidence NUMERIC(5,2),
  anomaly_data JSONB,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anomalies_entity ON anomalies(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_status ON anomalies(status);

-- Create recommendations table if it doesn't exist
CREATE TABLE IF NOT EXISTS recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  recommendation_type TEXT NOT NULL,
  recommendation_data JSONB,
  applied BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recommendations_entity ON recommendations(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_applied ON recommendations(applied);

-- Create agent_requests table if it doesn't exist
CREATE TABLE IF NOT EXISTS agent_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  entity_type TEXT,
  entity_id TEXT,
  request_type TEXT NOT NULL,
  request_data JSONB,
  status TEXT DEFAULT 'pending',
  response JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_requests_entity ON agent_requests(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_agent_requests_status ON agent_requests(status);

-- =======================================
-- BLUEPRINT TABLES (already exist but including for completeness)
-- =======================================

-- Check if claim_blueprints table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'claim_blueprints'
  ) THEN
    -- Create claim_blueprints table
    CREATE TABLE claim_blueprints (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      claim_id TEXT NOT NULL,
      recommended_title TEXT,
      issue_diagnosis JSONB,
      confidence_score NUMERIC NOT NULL,
      suggested_attachments JSONB,
      missing_data JSONB,
      risk_factors JSONB,
      vendor_id TEXT,
      vendor_specific_requirements JSONB,
      form_mapping JSONB,
      tools_used JSONB,
      processing_time NUMERIC,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Create indexes
    CREATE INDEX idx_claim_blueprints_claim_id ON claim_blueprints(claim_id);
    CREATE INDEX idx_claim_blueprints_vendor_id ON claim_blueprints(vendor_id);
    CREATE INDEX idx_claim_blueprints_confidence ON claim_blueprints(confidence_score);

    -- Enable RLS
    ALTER TABLE claim_blueprints ENABLE ROW LEVEL SECURITY;

    -- Create policies
    CREATE POLICY claim_blueprints_select_policy ON claim_blueprints
      FOR SELECT USING (
        claim_id IN (
          SELECT id FROM claims WHERE user_id = auth.uid()
        )
      );

    CREATE POLICY claim_blueprints_insert_policy ON claim_blueprints
      FOR INSERT WITH CHECK (true);

    CREATE POLICY claim_blueprints_update_policy ON claim_blueprints
      FOR UPDATE USING (true);
  END IF;
END
$$;

-- Check if vendor_requirements table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'vendor_requirements'
  ) THEN
    -- Create vendor_requirements table
    CREATE TABLE vendor_requirements (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      vendor_id TEXT NOT NULL UNIQUE,
      vendor_name TEXT NOT NULL,
      required_fields JSONB NOT NULL,
      optional_fields JSONB,
      rejection_criteria JSONB,
      form_templates JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Create index
    CREATE INDEX idx_vendor_requirements_vendor_id ON vendor_requirements(vendor_id);

    -- Insert sample data
    INSERT INTO vendor_requirements (vendor_id, vendor_name, required_fields, optional_fields, rejection_criteria, form_templates)
    VALUES 
      (
        'sony_professional', 
        'Sony Professional', 
        '["serial_number", "hours_of_use", "firmware_version", "edid_logs"]'::jsonb, 
        '["installation_date", "signal_source"]'::jsonb,
        '[
          {"field": "serial_number", "condition": "missing", "message": "Serial number is required for all Sony RMAs"},
          {"field": "hours_of_use", "condition": "missing", "message": "Hours of use is required for warranty validation"}
        ]'::jsonb,
        '{
          "sony_rma_form": {
            "mappings": {
              "issue_type": "display_irregularity",
              "section_3_field_12": "{{claim.description}}",
              "section_5_field_2": "{{blueprint.issue_diagnosis.primary_category}}"
            }
          }
        }'::jsonb
      ),
      (
        'epson', 
        'Epson', 
        '["serial_number", "error_code", "lamp_hours"]'::jsonb, 
        '["printer_counter", "ink_levels"]'::jsonb,
        '[
          {"field": "serial_number", "condition": "missing", "message": "Serial number is required for all Epson RMAs"},
          {"field": "error_code", "condition": "missing", "message": "Error code is required for printer issues"}
        ]'::jsonb,
        '{
          "epson_rma_form": {
            "mappings": {
              "product_type": "projector",
              "error_description": "{{claim.description}}",
              "error_code_field": "{{claim.additional_fields.error_code}}"
            }
          }
        }'::jsonb
      )
    ON CONFLICT (vendor_id) DO NOTHING;
  END IF;
END
$$;

-- Check if blueprint_templates table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'blueprint_templates'
  ) THEN
    -- Create blueprint_templates table
    CREATE TABLE blueprint_templates (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      equipment_type TEXT NOT NULL,
      manufacturer TEXT,
      issue_category TEXT NOT NULL,
      template_data JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(equipment_type, manufacturer, issue_category)
    );

    -- Create indexes
    CREATE INDEX idx_blueprint_templates_equipment ON blueprint_templates(equipment_type);
    CREATE INDEX idx_blueprint_templates_manufacturer ON blueprint_templates(manufacturer);
    CREATE INDEX idx_blueprint_templates_issue ON blueprint_templates(issue_category);

    -- Insert sample data
    INSERT INTO blueprint_templates (equipment_type, manufacturer, issue_category, template_data)
    VALUES 
      (
        'projector', 
        'sony', 
        'display', 
        '{
          "suggested_attachments": [
            {
              "type": "log",
              "name": "EDID Logs",
              "reason": "Sony requires EDID logs for all display issues",
              "priority": "critical"
            },
            {
              "type": "photo",
              "name": "Close-up of Affected Area",
              "reason": "Evidence of pixel damage pattern",
              "priority": "high"
            },
            {
              "type": "photo",
              "name": "Full Projection Test Pattern",
              "reason": "Shows extent of issue across entire display",
              "priority": "medium"
            }
          ],
          "missing_data_fields": [
            {
              "field": "Hours of Use",
              "importance": "high",
              "reason": "Required for warranty validation"
            },
            {
              "field": "Firmware Version",
              "importance": "medium",
              "reason": "Helps rule out software issues"
            }
          ]
        }'::jsonb
      ),
      (
        'printer', 
        'epson', 
        'paper_jam', 
        '{
          "suggested_attachments": [
            {
              "type": "photo",
              "name": "Paper Path",
              "reason": "Shows potential obstructions in paper path",
              "priority": "high"
            },
            {
              "type": "log",
              "name": "Error Log",
              "reason": "Provides error codes and jam frequency",
              "priority": "critical"
            }
          ],
          "missing_data_fields": [
            {
              "field": "Error Code",
              "importance": "high",
              "reason": "Identifies exact location of jam in printer mechanism"
            },
            {
              "field": "Paper Type",
              "importance": "medium",
              "reason": "Helps determine if paper type is compatible"
            }
          ]
        }'::jsonb
      )
    ON CONFLICT (equipment_type, manufacturer, issue_category) DO NOTHING;
  END IF;
END
$$;

-- =======================================
-- VERIFICATION TABLES (already exist but including for completeness)
-- =======================================

-- Check if claim_pipeline_audits table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'claim_pipeline_audits'
  ) THEN
    -- Create claim_pipeline_audits table
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

    -- Create indexes
    CREATE INDEX idx_claim_pipeline_audits_claim_id ON claim_pipeline_audits(claim_id);
    CREATE INDEX idx_claim_pipeline_audits_status ON claim_pipeline_audits(overall_status);
    CREATE INDEX idx_claim_pipeline_audits_requires_review ON claim_pipeline_audits(requires_review);
  END IF;
END
$$;

-- Check if claim_stage_verifications table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'claim_stage_verifications'
  ) THEN
    -- Create claim_stage_verifications table
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

    -- Create indexes
    CREATE INDEX idx_claim_stage_verifications_audit_id ON claim_stage_verifications(audit_id);
    CREATE INDEX idx_claim_stage_verifications_stage_status ON claim_stage_verifications(stage_status);
  END IF;
END
$$;

-- Check if tool_activation_audits table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tool_activation_audits'
  ) THEN
    -- Create tool_activation_audits table
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

    -- Create indexes
    CREATE INDEX idx_tool_activation_audits_audit_id ON tool_activation_audits(audit_id);
    CREATE INDEX idx_tool_activation_audits_claim_id ON tool_activation_audits(claim_id);
    CREATE INDEX idx_tool_activation_audits_tool_name ON tool_activation_audits(tool_name);
  END IF;
END
$$;

-- Check if claim_review_queue table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'claim_review_queue'
  ) THEN
    -- Create claim_review_queue table
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

    -- Create indexes
    CREATE INDEX idx_claim_review_queue_status ON claim_review_queue(status);
    CREATE INDEX idx_claim_review_queue_priority ON claim_review_queue(priority);
  END IF;
END
$$;

-- =======================================
-- RLS POLICIES
-- =======================================

-- Enable RLS on core tables
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_stream ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_store ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for claims
CREATE POLICY IF NOT EXISTS claims_select_policy ON claims
  FOR SELECT USING (user_id = auth.uid() OR auth.uid() IN (
    SELECT id FROM users WHERE role = 'admin'
  ));

CREATE POLICY IF NOT EXISTS claims_insert_policy ON claims
  FOR INSERT WITH CHECK (user_id = auth.uid() OR auth.uid() IN (
    SELECT id FROM users WHERE role = 'admin'
  ));

CREATE POLICY IF NOT EXISTS claims_update_policy ON claims
  FOR UPDATE USING (user_id = auth.uid() OR auth.uid() IN (
    SELECT id FROM users WHERE role = 'admin'
  ));

-- Create RLS policies for attachments
CREATE POLICY IF NOT EXISTS attachments_select_policy ON attachments
  FOR SELECT USING (claim_id IN (
    SELECT id FROM claims WHERE user_id = auth.uid()
  ) OR auth.uid() IN (
    SELECT id FROM users WHERE role = 'admin'
  ));

CREATE POLICY IF NOT EXISTS attachments_insert_policy ON attachments
  FOR INSERT WITH CHECK (claim_id IN (
    SELECT id FROM claims WHERE user_id = auth.uid()
  ) OR auth.uid() IN (
    SELECT id FROM users WHERE role = 'admin'
  ));

-- =======================================
-- FUNCTIONS AND TRIGGERS
-- =======================================

-- Blueprint update timestamp function
CREATE OR REPLACE FUNCTION update_blueprint_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create blueprint update trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_blueprint_timestamp_trigger'
  ) THEN
    CREATE TRIGGER update_blueprint_timestamp_trigger
    BEFORE UPDATE ON claim_blueprints
    FOR EACH ROW
    EXECUTE FUNCTION update_blueprint_timestamp();
  END IF;
END
$$;

-- Verification update claim audit status function
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

-- Create update claim audit status trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trig_update_claim_audit_status'
  ) THEN
    CREATE TRIGGER trig_update_claim_audit_status
    AFTER INSERT OR UPDATE ON claim_stage_verifications
    FOR EACH ROW
    EXECUTE FUNCTION update_claim_audit_status();
  END IF;
END
$$;

-- Add to review queue function
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

-- Create add to review queue trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trig_add_to_review_queue'
  ) THEN
    CREATE TRIGGER trig_add_to_review_queue
    AFTER UPDATE OF requires_review, review_reason ON claim_pipeline_audits
    FOR EACH ROW
    WHEN (NEW.requires_review = TRUE)
    EXECUTE FUNCTION add_to_review_queue();
  END IF;
END
$$;

-- Generic update timestamp function
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create update timestamp triggers for main tables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_timestamp') THEN
    CREATE TRIGGER update_users_timestamp
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_organizations_timestamp') THEN
    CREATE TRIGGER update_organizations_timestamp
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_claims_timestamp') THEN
    CREATE TRIGGER update_claims_timestamp
    BEFORE UPDATE ON claims
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_attachments_timestamp') THEN
    CREATE TRIGGER update_attachments_timestamp
    BEFORE UPDATE ON attachments
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_context_store_timestamp') THEN
    CREATE TRIGGER update_context_store_timestamp
    BEFORE UPDATE ON context_store
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_anomalies_timestamp') THEN
    CREATE TRIGGER update_anomalies_timestamp
    BEFORE UPDATE ON anomalies
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_recommendations_timestamp') THEN
    CREATE TRIGGER update_recommendations_timestamp
    BEFORE UPDATE ON recommendations
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_agent_requests_timestamp') THEN
    CREATE TRIGGER update_agent_requests_timestamp
    BEFORE UPDATE ON agent_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
  END IF;
END
$$;

-- Create sample data for testing (optional)
DO $$
BEGIN
  -- Insert a sample organization if none exists
  IF NOT EXISTS (SELECT 1 FROM organizations LIMIT 1) THEN
    INSERT INTO organizations (name) 
    VALUES ('Claimr Test Organization');
  END IF;
  
  -- Insert a sample claim if none exists
  IF NOT EXISTS (SELECT 1 FROM claims LIMIT 1) THEN
    INSERT INTO claims (
      id, 
      user_id, 
      title, 
      description, 
      equipment, 
      status
    )
    VALUES (
      'CLM' || floor(random() * 1000000)::text,
      (SELECT id FROM users LIMIT 1),
      'Sample Claim',
      'This is a sample claim description for testing purposes.',
      '{"manufacturer": "Sony", "model": "VPL-FHZ75", "serial": "12345678", "category": "projector"}'::jsonb,
      'draft'
    );
  END IF;
END
$$;
