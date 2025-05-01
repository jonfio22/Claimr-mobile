-- Real-time triggers for Claimr intelligence pipeline

-- Function to notify the intelligence pipeline when a claim is created or updated
CREATE OR REPLACE FUNCTION notify_intelligence_pipeline()
RETURNS TRIGGER AS $$
BEGIN
  -- Make HTTP POST request to the intelligence analysis endpoint
  PERFORM http_post(
    'https://api.claimr.app/intelligence/analyze',
    json_build_object(
      'claim_id', NEW.id, 
      'action', TG_OP,
      'timestamp', CURRENT_TIMESTAMP
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to claims table for real-time updates
DROP TRIGGER IF EXISTS claims_intelligence_trigger ON claims;
CREATE TRIGGER claims_intelligence_trigger
AFTER INSERT OR UPDATE ON claims
FOR EACH ROW EXECUTE PROCEDURE notify_intelligence_pipeline();

-- Function to track claim events for timeline
CREATE OR REPLACE FUNCTION log_claim_event()
RETURNS TRIGGER AS $$
DECLARE
  event_type TEXT;
  event_description TEXT;
BEGIN
  -- Determine event type based on operation and data
  IF TG_OP = 'INSERT' THEN
    event_type := 'claim_created';
    event_description := 'Claim was submitted';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status <> OLD.status THEN
      event_type := 'status_changed';
      event_description := 'Status changed from ' || OLD.status || ' to ' || NEW.status;
    ELSE
      event_type := 'claim_updated';
      event_description := 'Claim details were updated';
    END IF;
  END IF;
  
  -- Insert claim event record
  INSERT INTO claim_events (
    claim_id,
    event_type,
    event_description,
    event_date,
    metadata
  ) VALUES (
    NEW.id,
    event_type,
    event_description,
    CURRENT_TIMESTAMP,
    json_build_object(
      'previous_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
      'new_status', NEW.status,
      'operation', TG_OP
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to claims table for event logging
DROP TRIGGER IF EXISTS claims_event_logger_trigger ON claims;
CREATE TRIGGER claims_event_logger_trigger
AFTER INSERT OR UPDATE ON claims
FOR EACH ROW EXECUTE PROCEDURE log_claim_event();

-- Function to notify when new attachments are added
CREATE OR REPLACE FUNCTION notify_attachment_added()
RETURNS TRIGGER AS $$
BEGIN
  -- Make HTTP POST request to analyze the new attachment
  PERFORM http_post(
    'https://api.claimr.app/intelligence/analyze',
    json_build_object(
      'claim_id', NEW.claim_id,
      'attachment_ids', ARRAY[NEW.id],
      'action', 'analyze_attachment',
      'timestamp', CURRENT_TIMESTAMP
    )
  );
  
  -- Also log an event in the claim timeline
  INSERT INTO claim_events (
    claim_id,
    event_type,
    event_description,
    event_date,
    metadata
  ) VALUES (
    NEW.claim_id,
    'attachment_added',
    'New document was attached to the claim',
    CURRENT_TIMESTAMP,
    json_build_object(
      'attachment_id', NEW.id, 
      'attachment_type', NEW.file_type
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to claim_attachments table
DROP TRIGGER IF EXISTS attachment_analysis_trigger ON claim_attachments;
CREATE TRIGGER attachment_analysis_trigger
AFTER INSERT ON claim_attachments
FOR EACH ROW EXECUTE PROCEDURE notify_attachment_added();

-- Function to broadcast messages via WebSockets when AI analysis is updated
CREATE OR REPLACE FUNCTION broadcast_ai_insights()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when ai_insights field changes
  IF NEW.ai_insights IS DISTINCT FROM OLD.ai_insights THEN
    -- Perform the broadcast via pg_notify
    PERFORM pg_notify(
      'claim_ai_insights',
      json_build_object(
        'claim_id', NEW.id,
        'timestamp', CURRENT_TIMESTAMP,
        'event', 'ai_insights_updated'
      )::text
    );
    
    -- Also log an event in the claim timeline
    INSERT INTO claim_events (
      claim_id,
      event_type,
      event_description,
      event_date,
      metadata
    ) VALUES (
      NEW.id,
      'ai_analysis_completed',
      'AI analysis completed for this claim',
      CURRENT_TIMESTAMP,
      json_build_object(
        'analysis_id', NEW.id || '-' || extract(epoch from CURRENT_TIMESTAMP)::text,
        'insights_available', NEW.ai_insights IS NOT NULL
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger for AI insights broadcasting
DROP TRIGGER IF EXISTS ai_insights_broadcast_trigger ON claims;
CREATE TRIGGER ai_insights_broadcast_trigger
AFTER UPDATE ON claims
FOR EACH ROW EXECUTE PROCEDURE broadcast_ai_insights();
