-- Adicionar 'wordpress' ao enum lead_source
ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'wordpress';

-- Criar tabela para integrações WordPress
CREATE TABLE public.wordpress_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  leads_received INTEGER DEFAULT 0,
  last_lead_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(organization_id)
);

-- Enable RLS
ALTER TABLE public.wordpress_integrations ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can manage wordpress integration"
ON public.wordpress_integrations
FOR ALL
USING (organization_id = get_user_organization_id() AND is_admin());

CREATE POLICY "Users can view wordpress integration"
ON public.wordpress_integrations
FOR SELECT
USING (organization_id = get_user_organization_id());

-- Trigger for updated_at
CREATE TRIGGER update_wordpress_integrations_updated_at
BEFORE UPDATE ON public.wordpress_integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Criar tabela de notificações
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  type TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN DEFAULT false,
  lead_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their notifications"
ON public.notifications
FOR SELECT
USING (user_id = auth.uid() OR organization_id = get_user_organization_id());

CREATE POLICY "Users can update their notifications"
ON public.notifications
FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "System can create notifications"
ON public.notifications
FOR INSERT
WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Users can delete their notifications"
ON public.notifications
FOR DELETE
USING (user_id = auth.uid());