-- Avoid self-referential SELECT RLS on whatsapp_conversations.
-- INSERT ... RETURNING checks SELECT policies against the newly inserted row.
-- The previous SELECT policy called can_view_whatsapp_conversation(id), which
-- queried whatsapp_conversations by id and could not see the row during
-- RETURNING, causing valid conversation creation to fail with RLS.

DROP POLICY IF EXISTS whatsapp_conversations_select_owner_only
  ON public.whatsapp_conversations;

CREATE POLICY whatsapp_conversations_select_owner_only
  ON public.whatsapp_conversations
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND public.vimob_can_access_whatsapp_session(session_id, 'view')
  );

DROP POLICY IF EXISTS whatsapp_conversations_update_owner_only
  ON public.whatsapp_conversations;

CREATE POLICY whatsapp_conversations_update_owner_only
  ON public.whatsapp_conversations
  FOR UPDATE
  TO authenticated
  USING (
    deleted_at IS NULL
    AND public.vimob_can_access_whatsapp_session(session_id, 'view')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.whatsapp_sessions s
      WHERE s.id = whatsapp_conversations.session_id
        AND s.organization_id = whatsapp_conversations.organization_id
        AND s.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS whatsapp_conversations_delete_owner_only
  ON public.whatsapp_conversations;

CREATE POLICY whatsapp_conversations_delete_owner_only
  ON public.whatsapp_conversations
  FOR DELETE
  TO authenticated
  USING (
    deleted_at IS NULL
    AND public.vimob_can_access_whatsapp_session(session_id, 'view')
  );
