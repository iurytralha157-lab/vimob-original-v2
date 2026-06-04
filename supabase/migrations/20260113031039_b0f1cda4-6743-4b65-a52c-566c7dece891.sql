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
  field_mapping JSONB DEFAULT '{"name": "name", "phone": "phone", "email": "email", "message": "message"}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  leads_received INTEGER DEFAULT 0,
  last_lead_at TIMESTAMP WITH TIME ZONE,
  last_triggered_at TIMESTAMP WITH TIME ZONE,
  trigger_events TEXT[] DEFAULT ARRAY['lead.created']::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.webhooks_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view webhooks from their organization"
ON public.webhooks_integrations
FOR SELECT
USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Admins can create webhooks"
ON public.webhooks_integrations
FOR INSERT
WITH CHECK (organization_id = public.get_user_organization_id() AND public.is_admin());

CREATE POLICY "Admins can update webhooks"
ON public.webhooks_integrations
FOR UPDATE
USING (organization_id = public.get_user_organization_id() AND public.is_admin());

CREATE POLICY "Admins can delete webhooks"
ON public.webhooks_integrations
FOR DELETE
USING (organization_id = public.get_user_organization_id() AND public.is_admin());

-- Trigger for updated_at
CREATE TRIGGER update_webhooks_integrations_updated_at
BEFORE UPDATE ON public.webhooks_integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();