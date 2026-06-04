-- Remove broad organization-wide lead policies that bypass per-user/team access.

DROP POLICY IF EXISTS "leads_isolation" ON public.leads;
DROP POLICY IF EXISTS "leads_isolation_all" ON public.leads;

CREATE OR REPLACE FUNCTION public.can_access_lead(p_lead_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lead_org_id uuid;
  v_lead_assigned_to uuid;
  v_user_org_id uuid;
BEGIN
  SELECT l.organization_id, l.assigned_user_id
  INTO v_lead_org_id, v_lead_assigned_to
  FROM public.leads l
  WHERE l.id = p_lead_id;

  IF v_lead_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT u.organization_id INTO v_user_org_id
  FROM public.users u
  WHERE u.id = p_user_id;

  IF v_user_org_id IS NULL OR v_user_org_id != v_lead_org_id THEN
    RETURN FALSE;
  END IF;

  IF public.is_super_admin()
     OR public.is_admin()
     OR public.user_has_permission('lead_view_all', p_user_id)
     OR public.user_has_permission('lead_edit_all', p_user_id) THEN
    RETURN TRUE;
  END IF;

  IF v_lead_assigned_to = p_user_id THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.team_members tm_leader
    JOIN public.team_members tm_assigned ON tm_assigned.team_id = tm_leader.team_id
    WHERE tm_leader.user_id = p_user_id
      AND tm_leader.is_leader = true
      AND tm_assigned.user_id = v_lead_assigned_to
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$function$;

DROP POLICY IF EXISTS "Lead view all can select organization leads" ON public.leads;
CREATE POLICY "Lead view all can select organization leads"
  ON public.leads
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_id()
    AND public.user_has_permission('lead_view_all', auth.uid())
  );
