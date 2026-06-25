CREATE OR REPLACE FUNCTION public.vimob_user_has_active_org_membership(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = p_org_id
        AND om.is_active = true
    );
$$;

REVOKE ALL ON FUNCTION public.vimob_user_has_active_org_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vimob_user_has_active_org_membership(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.vimob_user_has_active_org_membership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vimob_user_has_active_org_membership(uuid) TO service_role;

DROP POLICY IF EXISTS organizations_select_active_member ON public.organizations;

CREATE POLICY organizations_select_active_member
ON public.organizations
FOR SELECT
TO authenticated
USING (public.vimob_user_has_active_org_membership(id));
