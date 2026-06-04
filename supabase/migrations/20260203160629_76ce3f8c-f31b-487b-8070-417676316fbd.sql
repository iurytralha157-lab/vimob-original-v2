-- Atualizar RLS de whatsapp_conversations para remover is_admin()
-- Agora admins precisam ter acesso explícito (proprietário ou via whatsapp_session_access)

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view conversations from accessible sessions" ON whatsapp_conversations;
DROP POLICY IF EXISTS "Users can update conversations from accessible sessions" ON whatsapp_conversations;

-- Recreate SELECT policy without is_admin()
CREATE POLICY "Users can view conversations from accessible sessions"
ON whatsapp_conversations
FOR SELECT
USING (
  is_super_admin()
  OR session_id IN (
    SELECT ws.id FROM whatsapp_sessions ws
    WHERE ws.organization_id = get_user_organization_id()
    AND (
      ws.owner_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM whatsapp_session_access wsa
        WHERE wsa.session_id = ws.id
        AND wsa.user_id = auth.uid()
        AND wsa.can_view = true
      )
    )
  )
);

-- Recreate UPDATE policy without is_admin()
CREATE POLICY "Users can update conversations from accessible sessions"
ON whatsapp_conversations
FOR UPDATE
USING (
  is_super_admin()
  OR session_id IN (
    SELECT ws.id FROM whatsapp_sessions ws
    WHERE ws.organization_id = get_user_organization_id()
    AND (
      ws.owner_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM whatsapp_session_access wsa
        WHERE wsa.session_id = ws.id
        AND wsa.user_id = auth.uid()
        AND wsa.can_view = true
      )
    )
  )
);

-- Atualizar RLS de whatsapp_messages para remover is_admin()
DROP POLICY IF EXISTS "Users can view messages from accessible sessions" ON whatsapp_messages;
DROP POLICY IF EXISTS "Users can insert messages to accessible sessions" ON whatsapp_messages;

-- Recreate SELECT policy for messages without is_admin()
CREATE POLICY "Users can view messages from accessible sessions"
ON whatsapp_messages
FOR SELECT
USING (
  is_super_admin()
  OR conversation_id IN (
    SELECT wc.id FROM whatsapp_conversations wc
    WHERE wc.session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.organization_id = get_user_organization_id()
      AND (
        ws.owner_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM whatsapp_session_access wsa
          WHERE wsa.session_id = ws.id
          AND wsa.user_id = auth.uid()
          AND wsa.can_view = true
        )
      )
    )
  )
);

-- Recreate INSERT policy for messages without is_admin()
CREATE POLICY "Users can insert messages to accessible sessions"
ON whatsapp_messages
FOR INSERT
WITH CHECK (
  is_super_admin()
  OR conversation_id IN (
    SELECT wc.id FROM whatsapp_conversations wc
    WHERE wc.session_id IN (
      SELECT ws.id FROM whatsapp_sessions ws
      WHERE ws.organization_id = get_user_organization_id()
      AND (
        ws.owner_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM whatsapp_session_access wsa
          WHERE wsa.session_id = ws.id
          AND wsa.user_id = auth.uid()
          AND wsa.can_view = true
        )
      )
    )
  )
);