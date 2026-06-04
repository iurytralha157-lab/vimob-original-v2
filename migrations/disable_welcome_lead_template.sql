-- Desativa permanentemente o template de boas-vindas para leads.
-- Mensagem indesejada: "Olá {nome}, bem-vindo! Meu nome é {corretor} e serei seu consultor."
UPDATE public.notification_templates
SET is_active = false,
    updated_at = now()
WHERE slug = 'welcome_lead';
