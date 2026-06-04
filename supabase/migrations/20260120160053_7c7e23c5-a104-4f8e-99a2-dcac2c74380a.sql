-- Enable RLS on system_settings if not enabled
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Super admins can do everything on system_settings
CREATE POLICY "Super admins can view system settings"
ON public.system_settings FOR SELECT
USING (is_super_admin());

CREATE POLICY "Super admins can update system settings"
ON public.system_settings FOR UPDATE
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Super admins can insert system settings"
ON public.system_settings FOR INSERT
WITH CHECK (is_super_admin());

-- Anyone authenticated can read system settings (for logo display)
CREATE POLICY "Authenticated users can view system settings"
ON public.system_settings FOR SELECT
USING (auth.role() = 'authenticated');

-- Insert initial system settings record if none exists
INSERT INTO public.system_settings (key, value, description)
SELECT 'global', '{}'::jsonb, 'Configurações globais do sistema'
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings LIMIT 1);