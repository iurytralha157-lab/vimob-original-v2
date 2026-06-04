-- 1) Fix can_access_lead: replace broken teams.leader_id with team_members.is_leader
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
  
  IF public.is_super_admin() OR public.is_admin() THEN
    RETURN TRUE;
  END IF;
  
  IF v_lead_assigned_to = p_user_id THEN
    RETURN TRUE;
  END IF;
  
  -- Check if user is a team leader of any team that the assigned user belongs to
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

-- 2) Simplify whatsapp_conversations SELECT policy: remove can_access_lead fallback
DROP POLICY IF EXISTS "conversations_select" ON public.whatsapp_conversations;
CREATE POLICY "conversations_select" ON public.whatsapp_conversations
  FOR SELECT USING (
    is_super_admin() OR can_access_whatsapp_session(session_id)
  );

-- 3) Simplify whatsapp_messages SELECT policy: remove can_access_lead subquery
DROP POLICY IF EXISTS "messages_select" ON public.whatsapp_messages;
CREATE POLICY "messages_select" ON public.whatsapp_messages
  FOR SELECT USING (
    is_super_admin() OR can_access_whatsapp_session(session_id)
  );