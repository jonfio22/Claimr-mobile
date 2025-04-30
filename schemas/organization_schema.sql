-- Organization table to store basic org info
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  settings JSONB DEFAULT '{}'::jsonb,
  active BOOLEAN DEFAULT true
);

-- Organization vault table to store learning data
CREATE TABLE IF NOT EXISTS public.org_vaults (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vault_type TEXT NOT NULL, -- 'claim_patterns', 'vendor_insights', 'tech_behaviors', 'equipment_trends'
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  version INTEGER DEFAULT 1,
  
  UNIQUE(org_id, vault_type)
);

-- Organization vault logs to track changes and training
CREATE TABLE IF NOT EXISTS public.org_vault_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vault_id UUID NOT NULL REFERENCES public.org_vaults(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'training', 'update', 'retrieval', 'inference'
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID, -- user reference
  metrics JSONB DEFAULT '{}'::jsonb -- for tracking performance
);

-- Organization-specific behaviors and rules
CREATE TABLE IF NOT EXISTS public.org_behaviors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  behavior_type TEXT NOT NULL, -- 'escalation_rule', 'approval_hint', 'vendor_approach'
  priority INTEGER DEFAULT 100,
  conditions JSONB DEFAULT '{}'::jsonb,
  actions JSONB DEFAULT '{}'::jsonb,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add organization membership tracking
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);

-- Add organization context to claims
ALTER TABLE public.claims
ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);

-- Create functions for vault operations
CREATE OR REPLACE FUNCTION update_vault_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER set_timestamp_org_vaults
BEFORE UPDATE ON public.org_vaults
FOR EACH ROW
EXECUTE PROCEDURE update_vault_timestamp();

-- Create RLS policies for organization data
CREATE POLICY org_isolation_policy ON public.org_vaults 
FOR ALL USING (auth.uid() IN (
  SELECT u.id FROM users u WHERE u.org_id = org_vaults.org_id
));
