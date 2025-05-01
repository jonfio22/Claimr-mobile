-- Blueprint Generator SQL Schema
-- This schema creates tables for storing claim blueprints, which are pre-submission intelligence
-- that help users improve their claims before final submission

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: claim_blueprints
-- Stores the generated blueprints and their associated metadata
CREATE TABLE IF NOT EXISTS claim_blueprints (
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

-- Indexes for claim_blueprints
CREATE INDEX IF NOT EXISTS idx_claim_blueprints_claim_id ON claim_blueprints(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_blueprints_vendor_id ON claim_blueprints(vendor_id);
CREATE INDEX IF NOT EXISTS idx_claim_blueprints_confidence ON claim_blueprints(confidence_score);

-- RLS Policies for claim_blueprints
ALTER TABLE claim_blueprints ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own claim blueprints
CREATE POLICY claim_blueprints_select_policy ON claim_blueprints
  FOR SELECT USING (
    claim_id IN (
      SELECT id FROM claims WHERE user_id = auth.uid()
    )
  );

-- Allow the service role to insert/update claim blueprints
CREATE POLICY claim_blueprints_insert_policy ON claim_blueprints
  FOR INSERT WITH CHECK (true);

CREATE POLICY claim_blueprints_update_policy ON claim_blueprints
  FOR UPDATE USING (true);

-- Function: update_blueprint_timestamp()
-- Automatically updates the 'updated_at' field when a record is updated
CREATE OR REPLACE FUNCTION update_blueprint_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: update_blueprint_timestamp_trigger
-- Applies the update_blueprint_timestamp() function to claim_blueprints table
CREATE TRIGGER update_blueprint_timestamp_trigger
BEFORE UPDATE ON claim_blueprints
FOR EACH ROW
EXECUTE FUNCTION update_blueprint_timestamp();

-- Table: vendor_requirements
-- Stores specific requirements for different equipment vendors
CREATE TABLE IF NOT EXISTS vendor_requirements (
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

-- Indexes for vendor_requirements
CREATE INDEX IF NOT EXISTS idx_vendor_requirements_vendor_id ON vendor_requirements(vendor_id);

-- Insert some sample vendor requirements
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
  );

-- Table: blueprint_templates
-- Stores templates for different equipment types to assist with blueprint generation
CREATE TABLE IF NOT EXISTS blueprint_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipment_type TEXT NOT NULL,
  manufacturer TEXT,
  issue_category TEXT NOT NULL,
  template_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(equipment_type, manufacturer, issue_category)
);

-- Indexes for blueprint_templates
CREATE INDEX IF NOT EXISTS idx_blueprint_templates_equipment ON blueprint_templates(equipment_type);
CREATE INDEX IF NOT EXISTS idx_blueprint_templates_manufacturer ON blueprint_templates(manufacturer);
CREATE INDEX IF NOT EXISTS idx_blueprint_templates_issue ON blueprint_templates(issue_category);

-- Insert sample blueprint templates
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
  );
