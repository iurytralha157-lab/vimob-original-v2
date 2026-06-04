CREATE OR REPLACE FUNCTION public.can_access_whatsapp_session(p_session_id uuid, p_user_id uuid DEFAULT auth.uid())
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_session record;
  v_user_org_id uuid;
BEGIN
  IF public.is_super_admin() THEN RETURN TRUE; END IF;
  
  SELECT ws.organization_id, ws.owner_user_id INTO v_session
  FROM public.whatsapp_sessions ws WHERE ws.id = p_session_id;
  
  IF v_session IS NULL THEN RETURN FALSE; END IF;
  
  -- Owner always has access
  IF v_session.owner_user_id = p_user_id THEN RETURN TRUE; END IF;
  
  SELECT u.organization_id INTO v_user_org_id
  FROM public.users u WHERE u.id = p_user_id;
  
  IF v_user_org_id != v_session.organization_id THEN RETURN FALSE; END IF;
  
  IF public.is_admin() THEN RETURN TRUE; END IF;
  
  -- Check explicit access grants
  RETURN EXISTS (
    SELECT 1 FROM public.whatsapp_session_access wsa
    WHERE wsa.session_id = p_session_id AND wsa.user_id = p_user_id
  );
END;
$$;