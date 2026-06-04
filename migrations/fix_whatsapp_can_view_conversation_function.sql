-- =========================================================
-- Fix: can_view_whatsapp_conversation usava organization_members,
-- mas o projeto isola por users.organization_id. Isso fazia o
-- SELECT pós-INSERT em whatsapp_conversations falhar com
-- "new row violates row-level security policy".
--
-- Nova regra: super_admin OU dono da sessão OU usuário com
-- grant em whatsapp_session_access (can_view/can_send).
-- =========================================================

CREATE OR REPLACE FUNCTION public.can_view_whatsapp_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.whatsapp_conversations c
    JOIN public.whatsapp_sessions s ON s.id = c.session_id
    WHERE c.id = p_conversation_id
      AND (
        public.is_super_admin()
        OR s.owner_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.whatsapp_session_access wsa
          WHERE wsa.session_id = s.id
            AND wsa.user_id = auth.uid()
            AND (wsa.can_view = true OR wsa.can_send = true)
        )
      )
  );
$$;

-- Remove a policy legada de SELECT em whatsapp_sessions que ainda
-- vazava conexões por organization_members.
DROP POLICY IF EXISTS sessions_select_org ON public.whatsapp_sessions;

-- Garante a policy de SELECT por dono (idempotente)
DROP POLICY IF EXISTS sessions_select_owner_only ON public.whatsapp_sessions;
CREATE POLICY sessions_select_owner_only
ON public.whatsapp_sessions
FOR SELECT TO authenticated
USING (
  public.is_super_admin()
  OR owner_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.whatsapp_session_access wsa
    WHERE wsa.session_id = whatsapp_sessions.id
      AND wsa.user_id = auth.uid()
      AND (wsa.can_view = true OR wsa.can_send = true)
  )
);
