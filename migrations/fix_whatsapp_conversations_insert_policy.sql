-- =========================================================
-- Fix: INSERT em whatsapp_conversations estava negando para
-- usuários comuns porque dependia de organization_members.
-- Alinha com o isolamento por dono: pode inserir quem é dono
-- da sessão OU tem acesso compartilhado (can_view/can_send).
-- =========================================================

DROP POLICY IF EXISTS conversations_insert ON public.whatsapp_conversations;

CREATE POLICY conversations_insert
ON public.whatsapp_conversations
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.whatsapp_sessions s
    WHERE s.id = whatsapp_conversations.session_id
      AND s.organization_id = whatsapp_conversations.organization_id
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
  )
);
