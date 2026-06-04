-- =========================================================
-- Final Fix for WhatsApp Conversation Isolation and Access
-- This migration:
-- 1. Updates organizations SELECT policy to use users table as truth
-- 2. Makes can_view_whatsapp_conversation a SECURITY DEFINER function
-- 3. Simplifies and strengthens whatsapp_conversations INSERT policy
-- =========================================================

-- 1. Ensure organizations are visible to their members based on the users table
DROP POLICY IF EXISTS "Users can view all organizations they are members of" ON public.organizations;
DROP POLICY IF EXISTS "Users can view their own organization" ON public.organizations;

CREATE POLICY "Users can view their own organization"
ON public.organizations
FOR SELECT
TO authenticated
USING (
  id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
);

-- 2. Robust security definer function for conversation access
CREATE OR REPLACE FUNCTION public.can_view_whatsapp_conversation(p_conversation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_session_id uuid;
    v_owner_user_id uuid;
BEGIN
    -- Get session info for this conversation
    -- Using security definer context here ensures we see the row even if 
    -- RLS on sessions is being tricky during an insert post-check.
    SELECT session_id INTO v_session_id
    FROM public.whatsapp_conversations
    WHERE id = p_conversation_id;

    IF v_session_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Get owner of the session
    SELECT owner_user_id INTO v_owner_user_id
    FROM public.whatsapp_sessions
    WHERE id = v_session_id;

    -- Check access:
    -- - Super admins
    -- - Owner of the session
    -- - Users with explicit shared access
    RETURN (
        public.is_super_admin()
        OR v_owner_user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.whatsapp_session_access wsa
            WHERE wsa.session_id = v_session_id
              AND wsa.user_id = auth.uid()
              AND (wsa.can_view = true OR wsa.can_send = true)
        )
    );
END;
$function$;

-- 3. Fix whatsapp_conversations policies
DROP POLICY IF EXISTS conversations_insert_owner_or_shared_send ON public.whatsapp_conversations;
DROP POLICY IF EXISTS conversations_insert ON public.whatsapp_conversations;
DROP POLICY IF EXISTS conversations_select ON public.whatsapp_conversations;
DROP POLICY IF EXISTS conversations_update ON public.whatsapp_conversations;
DROP POLICY IF EXISTS conversations_delete ON public.whatsapp_conversations;

-- New INSERT policy: Must own session or have can_send permission
CREATE POLICY conversations_insert_v2
ON public.whatsapp_conversations
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.whatsapp_sessions s
    WHERE s.id = whatsapp_conversations.session_id
      AND (
        public.is_super_admin()
        OR s.owner_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.whatsapp_session_access wsa
          WHERE wsa.session_id = s.id
            AND wsa.user_id = auth.uid()
            AND wsa.can_send = true
        )
      )
  )
);

-- New SELECT policy: Use the robust function
CREATE POLICY conversations_select_v2
ON public.whatsapp_conversations
FOR SELECT
TO authenticated
USING (can_view_whatsapp_conversation(id));

-- New UPDATE policy: Use the robust function
CREATE POLICY conversations_update_v2
ON public.whatsapp_conversations
FOR UPDATE
TO authenticated
USING (can_view_whatsapp_conversation(id))
WITH CHECK (can_view_whatsapp_conversation(id));

-- New DELETE policy: Use the robust function
CREATE POLICY conversations_delete_v2
ON public.whatsapp_conversations
FOR DELETE
TO authenticated
USING (public.is_super_admin() OR can_view_whatsapp_conversation(id));

-- 4. Ensure whatsapp_messages also has robust access
DROP POLICY IF EXISTS messages_insert ON public.whatsapp_messages;
DROP POLICY IF EXISTS messages_select ON public.whatsapp_messages;
DROP POLICY IF EXISTS messages_update ON public.whatsapp_messages;

CREATE POLICY messages_insert_v2
ON public.whatsapp_messages
FOR INSERT
TO authenticated
WITH CHECK (can_view_whatsapp_conversation(conversation_id));

CREATE POLICY messages_select_v2
ON public.whatsapp_messages
FOR SELECT
TO authenticated
USING (can_view_whatsapp_conversation(conversation_id));

CREATE POLICY messages_update_v2
ON public.whatsapp_messages
FOR UPDATE
TO authenticated
USING (can_view_whatsapp_conversation(conversation_id))
WITH CHECK (can_view_whatsapp_conversation(conversation_id));
