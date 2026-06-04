CREATE OR REPLACE FUNCTION public.rebind_whatsapp_conversation_session(
  p_conversation_id uuid,
  p_session_id uuid,
  p_remote_jid text DEFAULT NULL
)
RETURNS public.whatsapp_conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_source public.whatsapp_conversations%ROWTYPE;
  v_target public.whatsapp_conversations%ROWTYPE;
  v_session public.whatsapp_sessions%ROWTYPE;
  v_result public.whatsapp_conversations%ROWTYPE;
  v_can_send boolean := false;
  v_can_access_lead boolean := false;
  v_remote_jid text;
  v_phone_digits text;
  v_matched_lead_id uuid;
BEGIN
  SELECT *
  INTO v_source
  FROM public.whatsapp_conversations
  WHERE id = p_conversation_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WhatsApp conversation not found';
  END IF;

  SELECT *
  INTO v_session
  FROM public.whatsapp_sessions
  WHERE id = p_session_id
    AND status = 'connected';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Connected WhatsApp session not found';
  END IF;

  IF v_source.organization_id IS NOT NULL
     AND v_session.organization_id IS NOT NULL
     AND v_source.organization_id <> v_session.organization_id THEN
    RAISE EXCEPTION 'Conversation and session belong to different organizations';
  END IF;

  v_can_send :=
    public.is_super_admin()
    OR v_session.owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.whatsapp_session_access access
      WHERE access.session_id = v_session.id
        AND access.user_id = auth.uid()
        AND access.can_send = true
    );

  IF NOT v_can_send THEN
    RAISE EXCEPTION 'User cannot send through this WhatsApp session';
  END IF;

  IF v_source.lead_id IS NOT NULL THEN
    v_can_access_lead := public.can_access_lead(v_source.lead_id, auth.uid());
  END IF;

  IF v_source.session_id IS NOT NULL
     AND v_source.session_id <> p_session_id
     AND NOT v_can_access_lead
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'User cannot rebind this conversation';
  END IF;

  v_remote_jid := COALESCE(NULLIF(p_remote_jid, ''), v_source.remote_jid);
  v_phone_digits := regexp_replace(COALESCE(v_source.contact_phone, v_remote_jid, ''), '\D', '', 'g');

  IF v_source.is_group IS NOT TRUE AND v_phone_digits <> '' THEN
    SELECT l.id
    INTO v_matched_lead_id
    FROM public.leads l
    WHERE l.organization_id = v_session.organization_id
      AND (
        regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g') = v_phone_digits
        OR regexp_replace(COALESCE(l.whatsapp, ''), '\D', '', 'g') = v_phone_digits
        OR right(regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g'), 11) = right(v_phone_digits, 11)
        OR right(regexp_replace(COALESCE(l.whatsapp, ''), '\D', '', 'g'), 11) = right(v_phone_digits, 11)
      )
    ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC
    LIMIT 1;
  END IF;

  SELECT *
  INTO v_target
  FROM public.whatsapp_conversations
  WHERE session_id = p_session_id
    AND remote_jid = v_remote_jid
    AND deleted_at IS NULL
    AND id <> p_conversation_id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.whatsapp_messages m
    SET
      conversation_id = v_target.id,
      session_id = p_session_id
    WHERE m.conversation_id = v_source.id
      AND NOT EXISTS (
        SELECT 1
        FROM public.whatsapp_messages existing
        WHERE existing.conversation_id = v_target.id
          AND existing.message_id = m.message_id
      );

    DELETE FROM public.whatsapp_messages m
    WHERE m.conversation_id = v_source.id
      AND EXISTS (
        SELECT 1
        FROM public.whatsapp_messages existing
        WHERE existing.conversation_id = v_target.id
          AND existing.message_id = m.message_id
          AND existing.id <> m.id
      );

    UPDATE public.whatsapp_conversations
    SET
      organization_id = COALESCE(v_target.organization_id, v_session.organization_id),
      lead_id = COALESCE(v_target.lead_id, v_source.lead_id, v_matched_lead_id),
      contact_name = COALESCE(NULLIF(v_target.contact_name, ''), NULLIF(v_source.contact_name, ''), v_target.contact_name),
      contact_phone = COALESCE(NULLIF(v_target.contact_phone, ''), NULLIF(v_source.contact_phone, ''), v_target.contact_phone),
      contact_picture = COALESCE(v_target.contact_picture, v_source.contact_picture),
      last_message = COALESCE(v_target.last_message, v_source.last_message),
      last_message_at = GREATEST(v_target.last_message_at, v_source.last_message_at),
      updated_at = now()
    WHERE id = v_target.id
    RETURNING * INTO v_result;

    DELETE FROM public.whatsapp_conversations
    WHERE id = v_source.id
      AND NOT EXISTS (
        SELECT 1
        FROM public.whatsapp_messages remaining
        WHERE remaining.conversation_id = v_source.id
      );

    RETURN v_result;
  END IF;

  UPDATE public.whatsapp_conversations
  SET
    session_id = p_session_id,
    organization_id = v_session.organization_id,
    remote_jid = v_remote_jid,
    lead_id = COALESCE(lead_id, v_matched_lead_id),
    updated_at = now()
  WHERE id = p_conversation_id
  RETURNING * INTO v_result;

  UPDATE public.whatsapp_messages
  SET session_id = p_session_id
  WHERE conversation_id = v_result.id
    AND session_id IS DISTINCT FROM p_session_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rebind_whatsapp_conversation_session(uuid, uuid, text) TO authenticated;
