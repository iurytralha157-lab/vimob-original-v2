-- =========================================================
-- WhatsApp Sessions: ISOLAMENTO ESTRITO POR DONO
-- Cada usuário (inclusive admins de organização) só pode
-- ver/atualizar/excluir SUAS PRÓPRIAS conexões.
-- Apenas super_admin de plataforma mantém acesso global.
-- =========================================================

-- 1) Remove a policy que vazava conexões para toda a organização
DROP POLICY IF EXISTS sessions_select_org ON public.whatsapp_sessions;
DROP POLICY IF EXISTS sessions_super_admin_all ON public.whatsapp_sessions;
DROP POLICY IF EXISTS sessions_select_own ON public.whatsapp_sessions;
DROP POLICY IF EXISTS sessions_update_own ON public.whatsapp_sessions;
DROP POLICY IF EXISTS sessions_delete_own ON public.whatsapp_sessions;
DROP POLICY IF EXISTS sessions_insert_own ON public.whatsapp_sessions;

-- 2) SELECT: somente o dono (ou super admin de plataforma)
CREATE POLICY sessions_select_owner_only
ON public.whatsapp_sessions
FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR owner_user_id = auth.uid()
);

-- 3) INSERT: usuário só cria conexões para si mesmo, dentro da própria organização
CREATE POLICY sessions_insert_owner_only
ON public.whatsapp_sessions
FOR INSERT TO authenticated
WITH CHECK (
  owner_user_id = auth.uid()
  AND organization_id = public.get_user_organization_id()
);

-- 4) UPDATE: somente o dono
CREATE POLICY sessions_update_owner_only
ON public.whatsapp_sessions
FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR owner_user_id = auth.uid()
)
WITH CHECK (
  public.is_super_admin()
  OR owner_user_id = auth.uid()
);

-- 5) DELETE: somente o dono
CREATE POLICY sessions_delete_owner_only
ON public.whatsapp_sessions
FOR DELETE TO authenticated
USING (
  public.is_super_admin()
  OR owner_user_id = auth.uid()
);

-- =========================================================
-- whatsapp_session_access: compartilhamento gerenciado
-- SOMENTE pelo dono da conexão (owner_user_id da sessão).
-- =========================================================

DROP POLICY IF EXISTS session_access_select ON public.whatsapp_session_access;
DROP POLICY IF EXISTS session_access_owner_insert ON public.whatsapp_session_access;
DROP POLICY IF EXISTS session_access_owner_update ON public.whatsapp_session_access;
DROP POLICY IF EXISTS session_access_owner_delete ON public.whatsapp_session_access;

CREATE POLICY session_access_select
ON public.whatsapp_session_access
FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.whatsapp_sessions s
    WHERE s.id = whatsapp_session_access.session_id
      AND s.owner_user_id = auth.uid()
  )
);

CREATE POLICY session_access_owner_insert
ON public.whatsapp_session_access
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.whatsapp_sessions s
    WHERE s.id = whatsapp_session_access.session_id
      AND s.owner_user_id = auth.uid()
  )
);

CREATE POLICY session_access_owner_update
ON public.whatsapp_session_access
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.whatsapp_sessions s
    WHERE s.id = whatsapp_session_access.session_id
      AND s.owner_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.whatsapp_sessions s
    WHERE s.id = whatsapp_session_access.session_id
      AND s.owner_user_id = auth.uid()
  )
);

CREATE POLICY session_access_owner_delete
ON public.whatsapp_session_access
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.whatsapp_sessions s
    WHERE s.id = whatsapp_session_access.session_id
      AND s.owner_user_id = auth.uid()
  )
);
