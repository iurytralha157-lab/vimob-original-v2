-- Ajuste nas políticas de RLS para whatsapp_sessions
-- Objetivo: Resolver erro de permissão ao criar sessões e evitar dependência circular no SELECT

-- 1. Melhorar a política de inserção (INSERT)
DROP POLICY IF EXISTS whatsapp_sessions_insert_owner ON whatsapp_sessions;
CREATE POLICY whatsapp_sessions_insert_owner ON whatsapp_sessions
    FOR INSERT 
    WITH CHECK (
        auth.role() = 'authenticated' AND (
            is_super_admin() OR 
            owner_user_id = auth.uid()
        )
    );

-- 2. Otimizar a política de seleção (SELECT)
DROP POLICY IF EXISTS whatsapp_sessions_select_accessible ON whatsapp_sessions;
CREATE POLICY whatsapp_sessions_select_accessible ON whatsapp_sessions
    FOR SELECT
    USING (
        auth.role() = 'authenticated' AND (
            is_super_admin() OR 
            owner_user_id = auth.uid() OR
            vimob_can_access_whatsapp_session(id, 'view')
        )
    );

-- 3. Atualizar política de UPDATE
DROP POLICY IF EXISTS whatsapp_sessions_update_owner ON whatsapp_sessions;
CREATE POLICY whatsapp_sessions_update_owner ON whatsapp_sessions
    FOR UPDATE
    USING (
        auth.role() = 'authenticated' AND (
            is_super_admin() OR 
            owner_user_id = auth.uid()
        )
    )
    WITH CHECK (
        auth.role() = 'authenticated' AND (
            is_super_admin() OR 
            owner_user_id = auth.uid()
        )
    );

-- 4. Atualizar política de DELETE
DROP POLICY IF EXISTS whatsapp_sessions_delete_owner ON whatsapp_sessions;
CREATE POLICY whatsapp_sessions_delete_owner ON whatsapp_sessions
    FOR DELETE
    USING (
        auth.role() = 'authenticated' AND (
            is_super_admin() OR 
            owner_user_id = auth.uid()
        )
    );
