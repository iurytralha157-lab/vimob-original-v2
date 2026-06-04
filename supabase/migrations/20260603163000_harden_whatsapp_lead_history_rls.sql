-- Keep WhatsApp history visible through lead access without granting send/update access.

DROP POLICY IF EXISTS "whatsapp_sessions_update_owner" ON public.whatsapp_sessions;

DROP POLICY IF EXISTS "whatsapp_conversations_select_lead_access" ON public.whatsapp_conversations;
CREATE POLICY "whatsapp_conversations_select_lead_access"
ON public.whatsapp_conversations
FOR SELECT
TO authenticated
USING (
  lead_id IS NOT NULL
  AND public.can_access_lead(lead_id, auth.uid())
);

DROP POLICY IF EXISTS "messages_select_lead_access" ON public.whatsapp_messages;
CREATE POLICY "messages_select_lead_access"
ON public.whatsapp_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.whatsapp_conversations wc
    WHERE wc.id = whatsapp_messages.conversation_id
      AND wc.deleted_at IS NULL
      AND wc.lead_id IS NOT NULL
      AND public.can_access_lead(wc.lead_id, auth.uid())
  )
);
