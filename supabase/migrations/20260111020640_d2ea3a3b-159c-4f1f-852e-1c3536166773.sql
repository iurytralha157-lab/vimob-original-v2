-- Create meta_form_configs table for per-form configuration
CREATE TABLE public.meta_form_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES meta_integrations(id) ON DELETE CASCADE,
  form_id text NOT NULL,
  form_name text,
  
  -- Lead destination
  pipeline_id uuid REFERENCES pipelines(id) ON DELETE SET NULL,
  stage_id uuid REFERENCES stages(id) ON DELETE SET NULL,
  default_status text DEFAULT 'novo',
  assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  
  -- Property linking
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  
  -- Auto tags (array of tag_ids)
  auto_tags jsonb DEFAULT '[]'::jsonb,
  
  -- Field mapping from Meta form fields to CRM fields
  field_mapping jsonb DEFAULT '{}'::jsonb,
  
  -- Custom fields config for display
  custom_fields_config jsonb DEFAULT '[]'::jsonb,
  
  is_active boolean DEFAULT true,
  leads_received integer DEFAULT 0,
  last_lead_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(organization_id, form_id)
);

-- Add custom_fields column to leads table
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}'::jsonb;

-- Enable RLS
ALTER TABLE public.meta_form_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for meta_form_configs
CREATE POLICY "Admins can manage meta form configs"
  ON public.meta_form_configs
  FOR ALL
  USING ((organization_id = get_user_organization_id()) AND is_admin());

CREATE POLICY "Users can view meta form configs"
  ON public.meta_form_configs
  FOR SELECT
  USING (organization_id = get_user_organization_id());

-- Indexes for performance
CREATE INDEX idx_meta_form_configs_org ON public.meta_form_configs(organization_id);
CREATE INDEX idx_meta_form_configs_form_id ON public.meta_form_configs(form_id);
CREATE INDEX idx_meta_form_configs_integration ON public.meta_form_configs(integration_id);

-- Trigger for updated_at
CREATE TRIGGER update_meta_form_configs_updated_at
  BEFORE UPDATE ON public.meta_form_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();