-- 1. Remover política permissiva que vaza dados (SELECT)
DROP POLICY IF EXISTS "Users can view their organization conversations" 
ON whatsapp_conversations;

-- 2. Remover política de update também baseada em org_id
DROP POLICY IF EXISTS "Users can update their organization conversations" 
ON whatsapp_conversations;

-- 3. Criar política de update correta baseada em acesso à sessão
-- Primeiro verificar se já existe e dropar se existir
DROP POLICY IF EXISTS "Users can update conversations from accessible sessions"
ON whatsapp_conversations;

CREATE POLICY "Users can update conversations from accessible sessions"
ON whatsapp_conversations FOR UPDATE
USING (
  session_id IN (
    SELECT ws.id 
    FROM whatsapp_sessions ws
    WHERE ws.organization_id = get_user_organization_id()
    AND (
      ws.owner_user_id = auth.uid()
      OR is_admin()
      OR ws.id IN (
        SELECT wsa.session_id 
        FROM whatsapp_session_access wsa
        WHERE wsa.user_id = auth.uid() AND wsa.can_view = true
      )
    )
  )
);