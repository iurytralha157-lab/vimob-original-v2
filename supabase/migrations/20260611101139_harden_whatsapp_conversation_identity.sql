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
  v_phone_local text;
  v_phone_without_country text;
  v_phone_without_ninth text;
  v_phone_with_ninth text;
  v_is_group boolean := false;
  v_is_lid boolean := false;
  v_is_newsletter boolean := false;
  v_has_real_phone boolean := false;
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
  v_is_group := COALESCE(v_source.is_group, false) OR v_remote_jid LIKE '%@g.us';
  v_is_lid := v_remote_jid LIKE '%@lid';
  v_is_newsletter := v_remote_jid LIKE '%@newsletter';
  v_phone_digits := regexp_replace(COALESCE(v_source.contact_phone, v_remote_jid, ''), '\D', '', 'g');
  v_phone_without_country := CASE
    WHEN v_phone_digits LIKE '55%' AND length(v_phone_digits) >= 12 THEN substring(v_phone_digits from 3)
    ELSE v_phone_digits
  END;
  v_phone_local := v_phone_without_country;
  v_phone_without_ninth := CASE
    WHEN length(v_phone_local) = 11 AND substring(v_phone_local from 3 for 1) = '9'
      THEN substring(v_phone_local from 1 for 2) || substring(v_phone_local from 4)
    ELSE NULL
  END;
  v_phone_with_ninth := CASE
    WHEN length(v_phone_local) = 10
      THEN substring(v_phone_local from 1 for 2) || '9' || substring(v_phone_local from 3)
    ELSE NULL
  END;
  v_has_real_phone := NOT v_is_group
    AND NOT v_is_lid
    AND NOT v_is_newsletter
    AND length(v_phone_digits) BETWEEN 10 AND 13;

  IF NOT v_is_group THEN
    IF v_source.lead_id IS NOT NULL THEN
      v_matched_lead_id := v_source.lead_id;
    ELSIF v_has_real_phone THEN
      SELECT l.id
      INTO v_matched_lead_id
      FROM public.leads l
      WHERE l.organization_id = v_session.organization_id
        AND l.phone IS NOT NULL
        AND (
          regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g') IN (
            v_phone_digits,
            v_phone_without_country,
            '55' || v_phone_without_country,
            COALESCE(v_phone_without_ninth, ''),
            CASE WHEN v_phone_without_ninth IS NOT NULL THEN '55' || v_phone_without_ninth ELSE '' END,
            COALESCE(v_phone_with_ninth, ''),
            CASE WHEN v_phone_with_ninth IS NOT NULL THEN '55' || v_phone_with_ninth ELSE '' END
          )
          OR right(regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g'), 8) = right(v_phone_digits, 8)
        )
      ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC
      LIMIT 1;
    END IF;
  END IF;

  SELECT c.*
  INTO v_target
  FROM public.whatsapp_conversations c
  WHERE c.organization_id = v_session.organization_id
    AND c.deleted_at IS NULL
    AND c.id <> p_conversation_id
    AND COALESCE(c.is_group, false) = v_is_group
    AND (
      (NOT v_is_group AND v_matched_lead_id IS NOT NULL AND c.lead_id = v_matched_lead_id)
      OR (
        NOT v_is_group
        AND v_has_real_phone
        AND (
          regexp_replace(COALESCE(c.contact_phone, c.remote_jid, ''), '\D', '', 'g') IN (
            v_phone_digits,
            v_phone_without_country,
            '55' || v_phone_without_country,
            COALESCE(v_phone_without_ninth, ''),
            CASE WHEN v_phone_without_ninth IS NOT NULL THEN '55' || v_phone_without_ninth ELSE '' END,
            COALESCE(v_phone_with_ninth, ''),
            CASE WHEN v_phone_with_ninth IS NOT NULL THEN '55' || v_phone_with_ninth ELSE '' END
          )
          OR right(regexp_replace(COALESCE(c.contact_phone, c.remote_jid, ''), '\D', '', 'g'), 8) = right(v_phone_digits, 8)
        )
      )
      OR (
        c.session_id = p_session_id
        AND c.remote_jid = v_remote_jid
      )
    )
  ORDER BY
    CASE WHEN NOT v_is_group AND v_matched_lead_id IS NOT NULL AND c.lead_id = v_matched_lead_id THEN 0 ELSE 1 END,
    CASE WHEN c.session_id = p_session_id THEN 0 ELSE 1 END,
    c.last_message_at DESC NULLS LAST,
    c.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.whatsapp_messages m
    SET conversation_id = v_target.id
    WHERE m.conversation_id = v_source.id
      AND NOT EXISTS (
        SELECT 1
        FROM public.whatsapp_messages existing
        WHERE existing.conversation_id = v_target.id
          AND existing.message_id = m.message_id
          AND existing.message_id IS NOT NULL
      );

    DELETE FROM public.whatsapp_messages m
    WHERE m.conversation_id = v_source.id
      AND EXISTS (
        SELECT 1
        FROM public.whatsapp_messages existing
        WHERE existing.conversation_id = v_target.id
          AND existing.message_id = m.message_id
          AND existing.message_id IS NOT NULL
          AND existing.id <> m.id
      );

    UPDATE public.whatsapp_conversations
    SET
      session_id = NULL,
      deleted_at = now(),
      updated_at = now()
    WHERE id = v_source.id;

    UPDATE public.whatsapp_conversations
    SET
      organization_id = COALESCE(v_target.organization_id, v_session.organization_id),
      session_id = p_session_id,
      lead_id = CASE
        WHEN v_is_group THEN NULL
        ELSE COALESCE(v_target.lead_id, v_source.lead_id, v_matched_lead_id)
      END,
      remote_jid = CASE
        WHEN v_is_group THEN v_remote_jid
        WHEN v_is_lid OR v_is_newsletter THEN v_target.remote_jid
        ELSE COALESCE(NULLIF(v_target.remote_jid, ''), v_remote_jid)
      END,
      contact_name = COALESCE(NULLIF(v_target.contact_name, ''), NULLIF(v_source.contact_name, ''), v_target.contact_name),
      contact_phone = CASE
        WHEN v_is_group THEN NULL
        WHEN v_has_real_phone THEN COALESCE(NULLIF(v_target.contact_phone, ''), v_phone_digits)
        ELSE v_target.contact_phone
      END,
      contact_picture = COALESCE(v_target.contact_picture, v_source.contact_picture),
      last_message = CASE
        WHEN v_target.last_message_at IS NULL THEN v_source.last_message
        WHEN v_source.last_message_at IS NULL THEN v_target.last_message
        WHEN v_source.last_message_at > v_target.last_message_at THEN v_source.last_message
        ELSE v_target.last_message
      END,
      last_message_at = GREATEST(v_target.last_message_at, v_source.last_message_at),
      updated_at = now()
    WHERE id = v_target.id
    RETURNING * INTO v_result;

    RETURN v_result;
  END IF;

  UPDATE public.whatsapp_conversations
  SET
    session_id = p_session_id,
    organization_id = v_session.organization_id,
    remote_jid = v_remote_jid,
    lead_id = CASE
      WHEN v_is_group THEN NULL
      ELSE COALESCE(lead_id, v_matched_lead_id)
    END,
    contact_phone = CASE
      WHEN v_is_group THEN NULL
      WHEN v_has_real_phone THEN COALESCE(NULLIF(contact_phone, ''), v_phone_digits)
      ELSE NULLIF(contact_phone, v_phone_digits)
    END,
    updated_at = now()
  WHERE id = p_conversation_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rebind_whatsapp_conversation_session(uuid, uuid, text) TO authenticated;
