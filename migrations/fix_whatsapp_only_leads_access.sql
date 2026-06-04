-- Fix: owner_user_id pertence a whatsapp_sessions (não a whatsapp_conversations)

-- 1) Coluna "Apenas Leads" no acesso compartilhado
ALTER TABLE public.whatsapp_session_access
  ADD COLUMN IF NOT EXISTS only_leads_access boolean NOT NULL DEFAULT false;

-- 2) Recria a policy de SELECT em whatsapp_conversations
DROP POLICY IF EXISTS conversations_privacy_policy ON public.whatsapp_conversations;

CREATE POLICY conversations_privacy_policy
ON public.whatsapp_conversations
FOR SELECT
USING (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.whatsapp_sessions s
    WHERE s.id = whatsapp_conversations.session_id
      AND s.owner_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.whatsapp_session_access wsa
    WHERE wsa.session_id = whatsapp_conversations.session_id
      AND wsa.user_id = auth.uid()
      AND (wsa.only_leads_access = false OR whatsapp_conversations.lead_id IS NOT NULL)
  )
);
