-- 1. Remover política permissiva demais que dá acesso a todas as conversas da org
DROP POLICY IF EXISTS "System can manage conversations" ON whatsapp_conversations;

-- 2. Remover políticas duplicadas de super admin
DROP POLICY IF EXISTS "Super admin access whatsapp_conversations" ON whatsapp_conversations;
DROP POLICY IF EXISTS "Super admin can manage whatsapp conversations" ON whatsapp_conversations;
DROP POLICY IF EXISTS "Super admin can view all whatsapp conversations" ON whatsapp_conversations;

-- 3. Recriar política de SELECT que respeita owner_user_id e session_access
DROP POLICY IF EXISTS "Users can view conversations from accessible sessions" ON whatsapp_conversations;

CREATE POLICY "Users can view conversations from accessible sessions"
ON whatsapp_conversations FOR SELECT
USING (
  is_super_admin() 
  OR (
    session_id IN (
      SELECT ws.id 
      FROM whatsapp_sessions ws
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

-- 4. Política para INSERT (webhooks e sistema - precisa permitir a organização inserir)
DROP POLICY IF EXISTS "Users can insert conversations for their organization" ON whatsapp_conversations;
DROP POLICY IF EXISTS "Allow insert conversations for organization" ON whatsapp_conversations;

CREATE POLICY "Allow insert conversations for organization"
ON whatsapp_conversations FOR INSERT
WITH CHECK (
  organization_id = get_user_organization_id()
  OR is_super_admin()
);

-- 5. Política para UPDATE - respeitar owner e session_access
DROP POLICY IF EXISTS "Users can update conversations from accessible sessions" ON whatsapp_conversations;

CREATE POLICY "Users can update conversations from accessible sessions"
ON whatsapp_conversations FOR UPDATE
USING (
  is_super_admin() 
  OR (
    session_id IN (
      SELECT ws.id 
      FROM whatsapp_sessions ws
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

-- 6. Política para DELETE
DROP POLICY IF EXISTS "Users can delete conversations from accessible sessions" ON whatsapp_conversations;

CREATE POLICY "Users can delete conversations from accessible sessions"
ON whatsapp_conversations FOR DELETE
USING (
  is_super_admin() 
  OR (
    session_id IN (
      SELECT ws.id 
      FROM whatsapp_sessions ws
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