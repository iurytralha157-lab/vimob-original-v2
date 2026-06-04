
-- Migration to fix WhatsApp access control
-- Drops overly permissive policies and standardizes on ownership/admin/explicit access

-- 1. WhatsApp Sessions
DROP POLICY IF EXISTS "Users can view their own sessions" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Users can view sessions they own or have access to" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "sessions_select" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Sessions are viewable by organization members" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Users can update their own sessions" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Users can delete their own sessions" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Session owners and admins can update" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Session owners and admins can delete" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Users can create sessions in their org" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Users can insert their own sessions" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "sessions_super_admin_all" ON public.whatsapp_sessions;

-- 2. WhatsApp Conversations
DROP POLICY IF EXISTS "conversations_select" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "conversations_update" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "conversations_delete" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "conversations_insert" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Users can view conversations from accessible sessions" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "System can manage conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Super admin access whatsapp_conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Super admin can view all whatsapp_conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Super admin can manage whatsapp_conversations" ON public.whatsapp_conversations;

-- 3. WhatsApp Messages
DROP POLICY IF EXISTS "messages_select" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "messages_update" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "messages_insert" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Users can view their own messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Users can view messages from accessible sessions" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "System can update message status" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Users can send messages to accessible sessions" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "messages_super_admin_all" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Super admin access whatsapp_messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Super admin can view all whatsapp_messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Super admin can manage whatsapp_messages" ON public.whatsapp_messages;

-- 4. WhatsApp Session Access
DROP POLICY IF EXISTS "session_access_select" ON public.whatsapp_session_access;
DROP POLICY IF EXISTS "session_access_manage" ON public.whatsapp_session_access;
DROP POLICY IF EXISTS "Users can view access grants for accessible sessions" ON public.whatsapp_session_access;
DROP POLICY IF EXISTS "Session owners and admins can manage access" ON public.whatsapp_session_access;

-- 5. WhatsApp Groups
DROP POLICY IF EXISTS "whatsapp_groups_select" ON public.whatsapp_groups;

-- Update the function can_view_whatsapp_conversation to include Org Admin check
CREATE OR REPLACE FUNCTION public.can_view_whatsapp_conversation(_conv_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.whatsapp_conversations c
    JOIN public.whatsapp_sessions s ON s.id = c.session_id
    LEFT JOIN public.whatsapp_session_access wsa
      ON wsa.session_id = c.session_id AND wsa.user_id = auth.uid()
    WHERE c.id = _conv_id
      AND (
        public.is_super_admin()
        OR (s.organization_id = public.get_user_organization_id() AND (
            s.owner_user_id = auth.uid() -- Dono da conexão vê tudo
            OR public.is_admin() -- Admin da org vê tudo
            OR (
              wsa.user_id IS NOT NULL AND (
                wsa.access_mode = 'full_inbox' -- Vê tudo na conexão
                OR (wsa.access_mode = 'all_leads' AND c.lead_id IS NOT NULL) -- Vê tudo que tem lead vinculado
                OR (wsa.access_mode = 'team_leads' AND c.lead_id IS NOT NULL AND EXISTS (
                      SELECT 1
                      FROM public.leads l
                      JOIN public.team_members tm_self ON tm_self.user_id = auth.uid()
                      JOIN public.team_members tm_lead ON tm_lead.team_id = tm_self.team_id
                                                    AND tm_lead.user_id = l.assigned_user_id
                      WHERE l.id = c.lead_id
                    )) -- Vê leads do próprio time
                OR (wsa.access_mode = 'assigned_leads_only' AND c.lead_id IS NOT NULL AND EXISTS (
                      SELECT 1 FROM public.leads l
                      WHERE l.id = c.lead_id AND l.assigned_user_id = auth.uid()
                    )) -- Vê apenas o que está atribuído a ele
              )
            )
          )
        )
      )
  );
$function$;

-- NOW RECREATE CLEAN POLICIES

-- WHATSAPP SESSIONS
CREATE POLICY "whatsapp_sessions_select" ON public.whatsapp_sessions
FOR SELECT TO authenticated
USING (public.can_access_whatsapp_session(id));

CREATE POLICY "whatsapp_sessions_insert" ON public.whatsapp_sessions
FOR INSERT TO authenticated
WITH CHECK (
  organization_id = public.get_user_organization_id() 
  AND owner_user_id = auth.uid()
);

CREATE POLICY "whatsapp_sessions_update" ON public.whatsapp_sessions
FOR UPDATE TO authenticated
USING (
  public.is_super_admin() OR 
  (organization_id = public.get_user_organization_id() AND (owner_user_id = auth.uid() OR public.is_admin()))
);

CREATE POLICY "whatsapp_sessions_delete" ON public.whatsapp_sessions
FOR DELETE TO authenticated
USING (
  public.is_super_admin() OR 
  (organization_id = public.get_user_organization_id() AND (owner_user_id = auth.uid() OR public.is_admin()))
);

-- WHATSAPP CONVERSATIONS
CREATE POLICY "whatsapp_conversations_select" ON public.whatsapp_conversations
FOR SELECT TO authenticated
USING (public.can_view_whatsapp_conversation(id));

CREATE POLICY "whatsapp_conversations_insert" ON public.whatsapp_conversations
FOR INSERT TO authenticated
WITH CHECK (public.can_access_whatsapp_session(session_id));

CREATE POLICY "whatsapp_conversations_update" ON public.whatsapp_conversations
FOR UPDATE TO authenticated
USING (public.can_view_whatsapp_conversation(id));

CREATE POLICY "whatsapp_conversations_delete" ON public.whatsapp_conversations
FOR DELETE TO authenticated
USING (public.can_access_whatsapp_session(session_id));

-- WHATSAPP MESSAGES
CREATE POLICY "whatsapp_messages_select" ON public.whatsapp_messages
FOR SELECT TO authenticated
USING (public.can_view_whatsapp_conversation(conversation_id));

CREATE POLICY "whatsapp_messages_insert" ON public.whatsapp_messages
FOR INSERT TO authenticated
WITH CHECK (public.can_view_whatsapp_conversation(conversation_id));

CREATE POLICY "whatsapp_messages_update" ON public.whatsapp_messages
FOR UPDATE TO authenticated
USING (public.can_view_whatsapp_conversation(conversation_id));

-- WHATSAPP SESSION ACCESS
CREATE POLICY "whatsapp_session_access_select" ON public.whatsapp_session_access
FOR SELECT TO authenticated
USING (public.can_access_whatsapp_session(session_id));

CREATE POLICY "whatsapp_session_access_all" ON public.whatsapp_session_access
FOR ALL TO authenticated
USING (
  public.is_super_admin() OR 
  EXISTS (
    SELECT 1 FROM public.whatsapp_sessions s
    WHERE s.id = session_id 
    AND s.organization_id = public.get_user_organization_id()
    AND (s.owner_user_id = auth.uid() OR public.is_admin())
  )
);

-- WHATSAPP GROUPS
CREATE POLICY "whatsapp_groups_select" ON public.whatsapp_groups
FOR SELECT TO authenticated
USING (public.can_access_whatsapp_session(session_id));
