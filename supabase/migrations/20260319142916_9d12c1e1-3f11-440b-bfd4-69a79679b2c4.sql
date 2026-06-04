
-- ============================================================
-- FIX: WhatsApp RLS infinite recursion
-- 
-- Root cause: whatsapp_sessions SELECT policy has inline subquery
-- on whatsapp_session_access, whose SELECT policy has inline subquery
-- back on whatsapp_sessions → infinite recursion → empty results.
--
-- Solution: Use existing SECURITY DEFINER functions that bypass RLS.
-- ============================================================

-- ============================
-- 1. whatsapp_sessions
-- ============================
DROP POLICY IF EXISTS "Users can view sessions they own or have access to" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Super admin can view all whatsapp sessions" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Super admin can manage whatsapp sessions" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Super admin access whatsapp_sessions" ON public.whatsapp_sessions;

CREATE POLICY "sessions_select" ON public.whatsapp_sessions
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (
      organization_id = get_user_organization_id()
      AND (
        is_admin()
        OR owner_user_id = auth.uid()
        OR user_has_session_access(id)
      )
    )
  );

CREATE POLICY "sessions_super_admin_all" ON public.whatsapp_sessions
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ============================
-- 2. whatsapp_session_access
-- ============================
DROP POLICY IF EXISTS "Users can view own access grants" ON public.whatsapp_session_access;
DROP POLICY IF EXISTS "Users can view session access" ON public.whatsapp_session_access;
DROP POLICY IF EXISTS "Users can view their own access grants and session owners can v" ON public.whatsapp_session_access;
DROP POLICY IF EXISTS "Users can manage session access" ON public.whatsapp_session_access;

CREATE POLICY "session_access_select" ON public.whatsapp_session_access
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR granted_by = auth.uid()
    OR is_admin()
    OR is_super_admin()
    OR has_whatsapp_session_ownership(session_id, auth.uid())
  );

CREATE POLICY "session_access_manage" ON public.whatsapp_session_access
  FOR ALL TO authenticated
  USING (
    granted_by = auth.uid()
    OR is_admin()
    OR is_super_admin()
    OR has_whatsapp_session_ownership(session_id, auth.uid())
  )
  WITH CHECK (
    granted_by = auth.uid()
    OR is_admin()
    OR is_super_admin()
    OR has_whatsapp_session_ownership(session_id, auth.uid())
  );

-- ============================
-- 3. whatsapp_conversations
-- ============================
DROP POLICY IF EXISTS "Users can view conversations from accessible sessions" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Users can view conversations linked to accessible leads" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Users can update conversations from accessible sessions" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Users can delete conversations from accessible sessions" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Allow insert conversations for organization" ON public.whatsapp_conversations;

CREATE POLICY "conversations_select" ON public.whatsapp_conversations
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR can_access_whatsapp_session(session_id)
    OR (lead_id IS NOT NULL AND can_access_lead(lead_id))
  );

CREATE POLICY "conversations_insert" ON public.whatsapp_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = get_user_organization_id()
    OR is_super_admin()
  );

CREATE POLICY "conversations_update" ON public.whatsapp_conversations
  FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR can_access_whatsapp_session(session_id)
  );

CREATE POLICY "conversations_delete" ON public.whatsapp_conversations
  FOR DELETE TO authenticated
  USING (
    is_super_admin()
    OR can_access_whatsapp_session(session_id)
  );

-- ============================
-- 4. whatsapp_messages
-- ============================
DROP POLICY IF EXISTS "Users can view messages from accessible sessions" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Users can view messages from lead-linked conversations" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Users can send messages to accessible sessions" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Users can insert messages to accessible sessions" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "System can update message status" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Super admin can view all whatsapp messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Super admin can manage whatsapp messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Super admin access whatsapp_messages" ON public.whatsapp_messages;

CREATE POLICY "messages_select" ON public.whatsapp_messages
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR can_access_whatsapp_session(session_id)
    OR (conversation_id IN (
      SELECT wc.id FROM whatsapp_conversations wc
      WHERE wc.lead_id IS NOT NULL AND can_access_lead(wc.lead_id)
    ))
  );

CREATE POLICY "messages_insert" ON public.whatsapp_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR can_access_whatsapp_session(session_id)
  );

CREATE POLICY "messages_update" ON public.whatsapp_messages
  FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR can_access_whatsapp_session(session_id)
  );

CREATE POLICY "messages_super_admin_all" ON public.whatsapp_messages
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());
