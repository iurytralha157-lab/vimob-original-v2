CREATE OR REPLACE FUNCTION public.rebind_whatsapp_conversation_session(
  p_conversation_id uuid,
  p_session_id uuid
)
RETURNS public.whatsapp_conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_conversation public.whatsapp_conversations%ROWTYPE;
  v_session public.whatsapp_sessions%ROWTYPE;
  v_can_send boolean := false;
  v_can_access_lead boolean := false;
BEGIN
  SELECT *
  INTO v_conversation
  FROM public.whatsapp_conversations
  WHERE id = p_conversation_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversa WhatsApp não encontrada';
  END IF;

  SELECT *
  INTO v_session
  FROM public.whatsapp_sessions
  WHERE id = p_session_id
    AND status = 'connected';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão WhatsApp conectada não encontrada';
  END IF;

  IF v_conversation.organization_id IS NOT NULL
     AND v_session.organization_id IS NOT NULL
     AND v_conversation.organization_id <> v_session.organization_id THEN
    RAISE EXCEPTION 'Conversa e sessão pertencem a organizações diferentes';
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
    RAISE EXCEPTION 'Usuário sem permissão para enviar por esta sessão';
  END IF;

  IF v_conversation.lead_id IS NOT NULL THEN
    v_can_access_lead := public.can_access_lead(v_conversation.lead_id, auth.uid());
  END IF;

  IF v_conversation.session_id IS NOT NULL
     AND v_conversation.session_id <> p_session_id
     AND NOT v_can_access_lead
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Usuário sem permissão para religar esta conversa';
  END IF;

  UPDATE public.whatsapp_conversations
  SET
    session_id = p_session_id,
    organization_id = v_session.organization_id,
    updated_at = now()
  WHERE id = p_conversation_id
  RETURNING * INTO v_conversation;

  RETURN v_conversation;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rebind_whatsapp_conversation_session(uuid, uuid) TO authenticated;
