
-- Create notification_templates table
CREATE TABLE IF NOT EXISTS public.notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    category TEXT DEFAULT 'info',
    event_key TEXT,
    channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'push', 'system', 'email')),
    title TEXT,
    message TEXT NOT NULL,
    variables TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    editable_by_admin BOOLEAN DEFAULT true,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create notification_logs table
CREATE TABLE IF NOT EXISTS public.notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES public.notification_templates(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    recipient TEXT,
    channel TEXT NOT NULL,
    payload JSONB DEFAULT '{}',
    response JSONB DEFAULT '{}',
    status TEXT NOT NULL,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

-- Seed all existing system notifications as templates
INSERT INTO public.notification_templates (name, slug, channel, category, message, variables)
VALUES 
('🎉 Negócio Ganho (WhatsApp)', 'deal_won_whatsapp', 'whatsapp', 'sales', '🎉 *Lead Ganho!*\nNome: {lead_name}\nParabéns pela venda!', ARRAY['lead_name']),
('Teste de Notificação Push', 'test_push', 'push', 'test', 'Esta é uma notificação de teste enviada via Web Push API!', ARRAY[]),
('Novo Lead Recebido', 'new_lead_received', 'system', 'leads', 'Novo lead recebido: {lead_name}', ARRAY['lead_name']),
('Lembrete de Agendamento', 'appointment_reminder', 'whatsapp', 'reminder', 'Olá {user_name}, passando para lembrar do seu agendamento amanhã às {time}.', ARRAY['user_name', 'time']),
('Boas-vindas ao Sistema', 'welcome_system', 'system', 'onboarding', 'Bem-vindo ao sistema, {user_name}! Estamos felizes em ter você conosco.', ARRAY['user_name'])
ON CONFLICT (slug) DO UPDATE SET 
    name = EXCLUDED.name,
    message = EXCLUDED.message,
    variables = EXCLUDED.variables;
