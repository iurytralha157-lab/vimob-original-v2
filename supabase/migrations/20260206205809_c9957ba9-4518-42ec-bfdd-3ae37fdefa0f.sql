-- Remover políticas RLS
DROP POLICY IF EXISTS "Users can view wordpress integration" ON public.wordpress_integrations;
DROP POLICY IF EXISTS "Admins can manage wordpress integration" ON public.wordpress_integrations;

-- Remover trigger
DROP TRIGGER IF EXISTS update_wordpress_integrations_updated_at ON public.wordpress_integrations;

-- Remover tabela
DROP TABLE IF EXISTS public.wordpress_integrations CASCADE;

-- Remover função de regeneração de token (se existir)
DROP FUNCTION IF EXISTS public.regenerate_wordpress_token(uuid);

-- Remover registros de módulos existentes
DELETE FROM public.organization_modules WHERE module_name = 'wordpress';