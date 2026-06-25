-- Admins must be able to see inactive members in their organization so they can
-- reactivate them. Regular users still only see active shared members.

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
      AND (
        target.is_active = true
        OR caller.role = 'admin'
        OR public.is_super_admin()
      )
  );
$$;

REVOKE ALL ON FUNCTION public.vimob_users_share_active_org(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vimob_users_share_active_org(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.vimob_users_share_active_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vimob_users_share_active_org(uuid) TO service_role;
