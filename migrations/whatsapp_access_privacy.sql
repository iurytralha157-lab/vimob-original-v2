-- Add only_leads_access to whatsapp_session_access
ALTER TABLE public.whatsapp_session_access ADD COLUMN IF NOT EXISTS only_leads_access boolean DEFAULT false;

-- Create a helper function to check access level
CREATE OR REPLACE FUNCTION public.get_whatsapp_access_level(p_session_id uuid, p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session record;
  v_user_role text;
  v_only_leads boolean;
BEGIN
  -- Super Admin
  IF public.is_super_admin() THEN RETURN 'full'; END IF;
  
  SELECT ws.organization_id, ws.owner_user_id INTO v_session
  FROM public.whatsapp_sessions ws WHERE ws.id = p_session_id;
  
  IF v_session IS NULL THEN RETURN 'none'; END IF;
  
  -- Owner
  IF v_session.owner_user_id = p_user_id THEN RETURN 'full'; END IF;
  
  -- Get user role and org
  SELECT role INTO v_user_role
  FROM public.users WHERE id = p_user_id AND organization_id = v_session.organization_id;
  
  -- Org Admin
  IF v_user_role = 'admin' THEN RETURN 'full'; END IF;
  
  -- Explicit Access
  SELECT wsa.only_leads_access INTO v_only_leads
  FROM public.whatsapp_session_access wsa
  WHERE wsa.session_id = p_session_id AND wsa.user_id = p_user_id;
  
  IF v_only_leads IS NOT NULL THEN
    IF v_only_leads THEN RETURN 'leads_only'; ELSE RETURN 'full'; END IF;
  END IF;
  
  RETURN 'none';
END;
$$;

-- Update RLS for whatsapp_conversations
DROP POLICY IF EXISTS conversations_select ON public.whatsapp_conversations;
CREATE POLICY conversations_select ON public.whatsapp_conversations
FOR SELECT TO public
USING (
  CASE get_whatsapp_access_level(session_id, auth.uid())
    WHEN 'full' THEN true
    WHEN 'leads_only' THEN lead_id IS NOT NULL
    ELSE false
  END
);

-- Update RLS for whatsapp_messages
DROP POLICY IF EXISTS messages_select ON public.whatsapp_messages;
CREATE POLICY messages_select ON public.whatsapp_messages
FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM public.whatsapp_conversations wc
    WHERE wc.id = conversation_id
    AND CASE get_whatsapp_access_level(wc.session_id, auth.uid())
          WHEN 'full' THEN true
          WHEN 'leads_only' THEN wc.lead_id IS NOT NULL
          ELSE false
        END
  )
);

-- Update insertion/update policies to also respect leads_only for sending
DROP POLICY IF EXISTS messages_insert ON public.whatsapp_messages;
CREATE POLICY messages_insert ON public.whatsapp_messages
FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.whatsapp_conversations wc
    WHERE wc.id = conversation_id
    AND (
      CASE get_whatsapp_access_level(wc.session_id, auth.uid())
        WHEN 'full' THEN true
        WHEN 'leads_only' THEN wc.lead_id IS NOT NULL
        ELSE false
      END
    )
  )
);

-- Update can_access_whatsapp_session to be used for general permission checks
-- It should return true if level is not 'none'
CREATE OR REPLACE FUNCTION public.can_access_whatsapp_session(p_session_id uuid, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
  SELECT get_whatsapp_access_level($1, $2) != 'none';
$function$;
