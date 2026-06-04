-- Permitir que qualquer usuário (autenticado ou não) veja as configurações do sistema
-- Isso é necessário para a página de login carregar a logo correta

CREATE POLICY "Public can view system settings"
ON public.system_settings
FOR SELECT
TO anon
USING (true);