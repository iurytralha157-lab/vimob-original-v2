-- Criar tabela para configurações globais do sistema (Super Admin)
CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logo_url_light text,
  logo_url_dark text,
  default_whatsapp text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Inserir registro padrão
INSERT INTO public.system_settings (id) VALUES (gen_random_uuid());

-- RLS para system_settings - apenas super admins podem ler/modificar
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view system settings"
  ON public.system_settings
  FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "Super admins can update system settings"
  ON public.system_settings
  FOR UPDATE
  USING (public.is_super_admin());

-- Todos podem ler (para exibir logo no app)
CREATE POLICY "Anyone can view system settings for logo"
  ON public.system_settings
  FOR SELECT
  USING (true);

-- Trigger para updated_at
CREATE TRIGGER update_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();