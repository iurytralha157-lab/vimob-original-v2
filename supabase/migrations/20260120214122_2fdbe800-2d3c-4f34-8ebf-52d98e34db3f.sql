-- Create webhooks_integrations table
CREATE TABLE public.webhooks_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'incoming' CHECK (type IN ('incoming', 'outgoing')),
  api_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  webhook_url TEXT,
  target_pipeline_id UUID REFERENCES public.pipelines(id) ON DELETE SET NULL,
  target_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  target_stage_id UUID REFERENCES public.stages(id) ON DELETE SET NULL,
  target_tag_ids UUID[] DEFAULT '{}',
  target_property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  field_mapping JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  leads_received INTEGER NOT NULL DEFAULT 0,
  last_lead_at TIMESTAMP WITH TIME ZONE,
  last_triggered_at TIMESTAMP WITH TIME ZONE,
  trigger_events TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX idx_webhooks_org ON public.webhooks_integrations(organization_id);
CREATE INDEX idx_webhooks_token ON public.webhooks_integrations(api_token);
CREATE INDEX idx_webhooks_active ON public.webhooks_integrations(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.webhooks_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view webhooks from their organization"
ON public.webhooks_integrations
FOR SELECT
USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Admins can manage webhooks"
ON public.webhooks_integrations
FOR ALL
USING (
  organization_id = public.get_user_organization_id() 
  AND (public.is_admin() OR public.is_super_admin())
);

-- Add trigger for updated_at
CREATE TRIGGER update_webhooks_integrations_updated_at
BEFORE UPDATE ON public.webhooks_integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Comment
COMMENT ON TABLE public.webhooks_integrations IS 'Webhooks para integração de leads (entrada) e eventos (saída)';