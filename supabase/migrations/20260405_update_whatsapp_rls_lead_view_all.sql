-- Allow users with lead_view_all permission to see WhatsApp conversations linked to leads in their org
DROP POLICY IF EXISTS "conversations_select" ON public.whatsapp_conversations;

CREATE POLICY "conversations_select" ON public.whatsapp_conversations
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR can_access_whatsapp_session(session_id)
    OR (
      lead_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_id
          AND l.organization_id = get_user_organization_id()
      )
      AND public.user_has_permission(auth.uid(), 'lead_view_all')
    )
  );

-- Allow users with lead_view_all permission to see WhatsApp messages from conversations linked to leads in their org
DROP POLICY IF EXISTS "messages_select" ON public.whatsapp_messages;

CREATE POLICY "messages_select" ON public.whatsapp_messages
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR can_access_whatsapp_session(session_id)
    OR EXISTS (
      SELECT 1 FROM public.whatsapp_conversations wc
      JOIN public.leads l ON l.id = wc.lead_id
      WHERE wc.id = conversation_id
        AND wc.deleted_at IS NULL
        AND l.organization_id = get_user_organization_id()
        AND public.user_has_permission(auth.uid(), 'lead_view_all')
    )
  );
