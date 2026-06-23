CREATE OR REPLACE FUNCTION public.vimob_users_share_active_org(p_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members caller
    JOIN public.organization_members target
      ON target.organization_id = caller.organization_id
    WHERE caller.user_id = auth.uid()
      AND caller.organization_id = public.get_user_organization_id()
      AND caller.is_active = true
      AND target.user_id = p_target_user_id
      AND target.is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public.vimob_users_share_active_org(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vimob_users_share_active_org(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.vimob_users_share_active_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vimob_users_share_active_org(uuid) TO service_role;

DROP POLICY IF EXISTS users_select_safe ON public.users;

CREATE POLICY users_select_safe
ON public.users
FOR SELECT
USING (
  id = auth.uid()
  OR public.is_super_admin()
  OR (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_id()
  )
  OR public.vimob_users_share_active_org(id)
);
