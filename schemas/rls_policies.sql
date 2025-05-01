-- Row Level Security (RLS) Policies for Claimr
-- This script implements comprehensive RLS policies for all tables in the Claimr application

----------------------------------------------
-- Claims Table
----------------------------------------------
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;

-- Users can view claims they own or are assigned to
CREATE POLICY "Users can view their own claims" 
ON claims FOR SELECT 
USING (auth.uid() = user_id OR auth.uid() = assignee_id);

-- Users can create their own claims
CREATE POLICY "Users can create their own claims" 
ON claims FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can update their own claims
CREATE POLICY "Users can update their own claims" 
ON claims FOR UPDATE 
USING (auth.uid() = user_id OR auth.uid() = assignee_id);

-- Users can delete their own claims if they're in draft status
CREATE POLICY "Users can delete their draft claims" 
ON claims FOR DELETE 
USING (auth.uid() = user_id AND status = 'DRAFT');

----------------------------------------------
-- Messages Table
----------------------------------------------
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Users can view messages for claims they own or are assigned to
CREATE POLICY "Users can view messages for their claims" 
ON messages FOR SELECT 
USING (claim_id IN (
  SELECT id FROM claims 
  WHERE user_id = auth.uid() OR assignee_id = auth.uid()
));

-- Users can insert messages for claims they own or are assigned to
CREATE POLICY "Users can insert messages for their claims" 
ON messages FOR INSERT 
WITH CHECK (claim_id IN (
  SELECT id FROM claims 
  WHERE user_id = auth.uid() OR assignee_id = auth.uid()
));

-- Users can only update their own messages
CREATE POLICY "Users can update their own messages" 
ON messages FOR UPDATE 
USING (sender_id = auth.uid());

-- Users can only delete their own messages
CREATE POLICY "Users can delete their own messages" 
ON messages FOR DELETE 
USING (sender_id = auth.uid());

----------------------------------------------
-- Photos Table
----------------------------------------------
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- Users can view photos for claims they own or are assigned to
CREATE POLICY "Users can view photos for their claims" 
ON photos FOR SELECT 
USING (claim_id IN (
  SELECT id FROM claims 
  WHERE user_id = auth.uid() OR assignee_id = auth.uid()
));

-- Users can insert photos for claims they own or are assigned to
CREATE POLICY "Users can insert photos for their claims" 
ON photos FOR INSERT 
WITH CHECK (claim_id IN (
  SELECT id FROM claims 
  WHERE user_id = auth.uid() OR assignee_id = auth.uid()
));

-- Users can only update photos they uploaded
CREATE POLICY "Users can update their own photos" 
ON photos FOR UPDATE 
USING (uploaded_by = auth.uid());

-- Users can only delete photos they uploaded
CREATE POLICY "Users can delete their own photos" 
ON photos FOR DELETE 
USING (uploaded_by = auth.uid());

----------------------------------------------
-- Equipment Table
----------------------------------------------
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

-- Users can view equipment in their organization
CREATE POLICY "Users can view equipment in their organization" 
ON equipment FOR SELECT 
USING (org_id IN (
  SELECT org_id FROM users
  WHERE id = auth.uid()
));

-- Only organization admins can add equipment
CREATE POLICY "Org admins can insert equipment" 
ON equipment FOR INSERT 
WITH CHECK (org_id IN (
  SELECT org_id FROM users
  WHERE id = auth.uid() AND is_admin = true
));

-- Only organization admins can update equipment
CREATE POLICY "Org admins can update equipment" 
ON equipment FOR UPDATE 
USING (org_id IN (
  SELECT org_id FROM users
  WHERE id = auth.uid() AND is_admin = true
));

----------------------------------------------
-- Organizations Table
----------------------------------------------
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Users can view organizations they belong to
CREATE POLICY "Users can view their organizations" 
ON organizations FOR SELECT 
USING (id IN (
  SELECT org_id FROM users
  WHERE id = auth.uid()
));

-- Only organization admins can update their organization
CREATE POLICY "Org admins can update their organization" 
ON organizations FOR UPDATE 
USING (id IN (
  SELECT org_id FROM users
  WHERE id = auth.uid() AND is_admin = true
));

----------------------------------------------
-- Org Vaults Table
----------------------------------------------
ALTER TABLE org_vaults ENABLE ROW LEVEL SECURITY;

-- Users can view vaults for their organization
CREATE POLICY "Users can view vaults for their organization" 
ON org_vaults FOR SELECT 
USING (org_id IN (
  SELECT org_id FROM users
  WHERE id = auth.uid()
));

-- Only internal services or organization admins can modify vaults
CREATE POLICY "Only services or admins can modify vaults" 
ON org_vaults FOR INSERT 
WITH CHECK (
  -- Check if request is coming from service account or org admin
  auth.uid() IN (
    SELECT id FROM api_keys
    WHERE permissions @> '{"org_vault_write": true}'
  ) OR 
  org_id IN (
    SELECT org_id FROM users
    WHERE id = auth.uid() AND is_admin = true
  )
);

CREATE POLICY "Only services or admins can update vaults" 
ON org_vaults FOR UPDATE 
USING (
  -- Check if request is coming from service account or org admin
  auth.uid() IN (
    SELECT id FROM api_keys
    WHERE permissions @> '{"org_vault_write": true}'
  ) OR 
  org_id IN (
    SELECT org_id FROM users
    WHERE id = auth.uid() AND is_admin = true
  )
);

----------------------------------------------
-- Claim Events Table
----------------------------------------------
ALTER TABLE claim_events ENABLE ROW LEVEL SECURITY;

-- Users can view events for claims they own or are assigned to
CREATE POLICY "Users can view events for their claims" 
ON claim_events FOR SELECT 
USING (claim_id IN (
  SELECT id FROM claims 
  WHERE user_id = auth.uid() OR assignee_id = auth.uid()
));

-- Services or users can create events for claims they own or are assigned to
CREATE POLICY "Services or users can create events for their claims" 
ON claim_events FOR INSERT 
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM api_keys
    WHERE permissions @> '{"claim_events_write": true}'
  ) OR
  claim_id IN (
    SELECT id FROM claims 
    WHERE user_id = auth.uid() OR assignee_id = auth.uid()
  )
);

----------------------------------------------
-- API Keys Table (Already implemented but included for completeness)
----------------------------------------------
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Users can only see their own API keys
CREATE POLICY "Users can view their own API keys"
ON api_keys FOR SELECT
USING (user_id = auth.uid());

-- Users can only create API keys for themselves or their org
CREATE POLICY "Users can create their own API keys"
ON api_keys FOR INSERT
WITH CHECK (
  user_id = auth.uid() OR
  (
    org_id IN (
      SELECT org_id FROM users
      WHERE id = auth.uid() AND is_admin = true
    )
  )
);

-- Users can only update their own API keys
CREATE POLICY "Users can update their own API keys"
ON api_keys FOR UPDATE
USING (user_id = auth.uid());

-- Users can only delete their own API keys
CREATE POLICY "Users can delete their own API keys"
ON api_keys FOR DELETE
USING (user_id = auth.uid());

----------------------------------------------
-- Linker Schemas Table
----------------------------------------------
ALTER TABLE linker_schemas ENABLE ROW LEVEL SECURITY;

-- Everyone can read schemas
CREATE POLICY "Anyone can read schemas"
ON linker_schemas FOR SELECT
USING (true);

-- Only service accounts can modify schemas
CREATE POLICY "Only services can modify schemas"
ON linker_schemas FOR INSERT
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM api_keys
    WHERE permissions @> '{"schema_write": true}'
  )
);

CREATE POLICY "Only services can update schemas"
ON linker_schemas FOR UPDATE
USING (
  auth.uid() IN (
    SELECT id FROM api_keys
    WHERE permissions @> '{"schema_write": true}'
  )
);

----------------------------------------------
-- Linker Tools Table
----------------------------------------------
ALTER TABLE linker_tools ENABLE ROW LEVEL SECURITY;

-- Everyone can read tools
CREATE POLICY "Anyone can read tools"
ON linker_tools FOR SELECT
USING (true);

-- Only service accounts can modify tools
CREATE POLICY "Only services can modify tools"
ON linker_tools FOR INSERT
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM api_keys
    WHERE permissions @> '{"tool_write": true}'
  )
);

CREATE POLICY "Only services can update tools"
ON linker_tools FOR UPDATE
USING (
  auth.uid() IN (
    SELECT id FROM api_keys
    WHERE permissions @> '{"tool_write": true}'
  )
);

-- Migrate any existing data permissions
DO $$
BEGIN
  PERFORM pg_catalog.pg_extension_config_dump('auth', '');
  PERFORM pg_catalog.pg_extension_config_dump('extensions', '');
END
$$;
