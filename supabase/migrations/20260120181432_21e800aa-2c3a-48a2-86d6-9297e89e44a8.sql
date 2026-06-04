-- Corrigir user_has_organization para usar apenas search_path = public
CREATE OR REPLACE FUNCTION public.user_has_organization()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND organization_id IS NOT NULL
  )
$$;