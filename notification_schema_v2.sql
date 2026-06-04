-- Etapa 2: Schema base para notificações multi-canal
-- 1. Evoluir notification_templates para multi-canal
ALTER TABLE notification_templates 
  ADD COLUMN IF NOT EXISTS channels text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS html_body text,
  ADD COLUMN IF NOT EXISTS dedupe_window_seconds int DEFAULT 60;

-- Backfill: popular channels a partir da coluna channel antiga
UPDATE notification_templates 
  SET channels = ARRAY[channel] 
  WHERE (channels = ARRAY[]::text[] OR channels IS NULL) AND channel IS NOT NULL;

-- 2. Criar notification_settings (configurações globais por organização)
CREATE TABLE IF NOT EXISTS public.notification_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_name text DEFAULT 'Vimob',
  from_email text,
  reply_to text,
  admin_emails text[] DEFAULT ARRAY[]::text[],
  test_phone text,
  test_email text,
  enabled_channels text[] DEFAULT ARRAY['system','whatsapp','email'],
  resend_verified boolean DEFAULT false,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read settings"
ON public.notification_settings FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Super Admins manage settings"
ON public.notification_settings FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND (users.role = 'super_admin' OR users.is_super_admin = true)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND (users.role = 'super_admin' OR users.is_super_admin = true)
  )
);

-- 3. Criar email_templates e email_logs (que faltam no banco atual)
CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  subject text NOT NULL,
  html text NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text,
  recipient_email text NOT NULL,
  subject text,
  status text NOT NULL,
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow users to read email templates" ON public.email_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow users to insert email logs" ON public.email_logs FOR INSERT TO authenticated WITH CHECK (true);

-- 4. Evoluir notification_logs para suportar deduplicação e testes
ALTER TABLE notification_logs 
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS is_test boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_notification_logs_dedupe ON notification_logs (dedupe_key, created_at DESC);

-- 5. Função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS tr_notification_templates_updated_at ON notification_templates;
CREATE TRIGGER tr_notification_templates_updated_at
    BEFORE UPDATE ON notification_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_notification_settings_updated_at ON notification_settings;
CREATE TRIGGER tr_notification_settings_updated_at
    BEFORE UPDATE ON notification_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
