-- Recriar a função user_has_organization com search_path corrigido para incluir 'auth'
CREATE OR REPLACE FUNCTION public.user_has_organization()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND organization_id IS NOT NULL
  )
$$;