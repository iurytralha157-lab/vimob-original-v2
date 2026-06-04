-- Create message templates table for WhatsApp
CREATE TABLE public.whatsapp_message_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'geral',
  variables TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_message_templates ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view templates from their organization"
ON public.whatsapp_message_templates FOR SELECT
USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can create templates in their organization"
ON public.whatsapp_message_templates FOR INSERT
WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update templates in their organization"
ON public.whatsapp_message_templates FOR UPDATE
USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Admins can delete templates"
ON public.whatsapp_message_templates FOR DELETE
USING (organization_id = public.get_user_organization_id() AND public.is_admin());

-- Create index for faster queries
CREATE INDEX idx_whatsapp_templates_org ON public.whatsapp_message_templates(organization_id);

-- Add trigger for updated_at
CREATE TRIGGER update_whatsapp_message_templates_updated_at
BEFORE UPDATE ON public.whatsapp_message_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();