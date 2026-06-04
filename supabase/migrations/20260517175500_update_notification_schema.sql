-- Step 1: Update notification_templates table
ALTER TABLE public.notification_templates ADD COLUMN IF NOT EXISTS channels TEXT[] DEFAULT '{}';
UPDATE public.notification_templates SET channels = ARRAY[channel] WHERE channel IS NOT NULL AND (channels IS NULL OR channels = '{}');
-- We keep channel for now to avoid breaking existing queries until everything is updated
-- ALTER TABLE public.notification_templates DROP COLUMN channel;

ALTER TABLE public.notification_templates ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE public.notification_templates ADD COLUMN IF NOT EXISTS html_body TEXT;
ALTER TABLE public.notification_templates ADD COLUMN IF NOT EXISTS dedupe_window_seconds INTEGER DEFAULT 60;

-- Step 2: Create notification_settings table
CREATE TABLE IF NOT EXISTS public.notification_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    from_name TEXT,
    from_email TEXT,
    reply_to TEXT,
    admin_emails TEXT[] DEFAULT '{}',
    test_phone TEXT,
    test_email TEXT,
    enabled_channels TEXT[] DEFAULT '{"system", "whatsapp"}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_org_settings UNIQUE (organization_id)
);

-- Step 3: Update notification_logs table
ALTER TABLE public.notification_logs ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
ALTER TABLE public.notification_logs ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;

-- Step 4: Create email_templates and email_logs
CREATE TABLE IF NOT EXISTS public.email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    template_key TEXT NOT NULL,
    name TEXT NOT NULL,
    subject TEXT,
    html TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_org_template_key UNIQUE (organization_id, template_key)
);

CREATE TABLE IF NOT EXISTS public.email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
    recipient TEXT NOT NULL,
    subject TEXT,
    status TEXT NOT NULL, -- sent, failed
    error TEXT,
    sent_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for new tables
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- Basic RLS Policies
DROP POLICY IF EXISTS "Admins can manage notification settings" ON public.notification_settings;
CREATE POLICY "Admins can manage notification settings" ON public.notification_settings
    FOR ALL USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND (u.role = 'admin' OR u.role = 'super_admin')));

DROP POLICY IF EXISTS "Admins can manage email templates" ON public.email_templates;
CREATE POLICY "Admins can manage email templates" ON public.email_templates
    FOR ALL USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND (u.role = 'admin' OR u.role = 'super_admin')));

DROP POLICY IF EXISTS "Admins can view email logs" ON public.email_logs;
CREATE POLICY "Admins can view email logs" ON public.email_logs
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND (u.role = 'admin' OR u.role = 'super_admin')));
