-- Corrigir função redistribute_lead_from_pool (sem ORDER BY no UPDATE)
CREATE OR REPLACE FUNCTION public.redistribute_lead_from_pool(p_lead_id uuid, p_reason text DEFAULT 'timeout')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_lead leads%ROWTYPE;
  v_old_user_id uuid;
  v_result jsonb;
  v_history_id uuid;
BEGIN
  -- Buscar o lead
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead not found');
  END IF;
  
  v_old_user_id := v_lead.assigned_user_id;
  
  -- Registrar no histórico e capturar o ID
  INSERT INTO lead_pool_history (lead_id, organization_id, from_user_id, reason)
  VALUES (p_lead_id, v_lead.organization_id, v_old_user_id, p_reason)
  RETURNING id INTO v_history_id;
  
  -- Limpar atribuição e incrementar contador
  UPDATE leads 
  SET assigned_user_id = NULL,
      assigned_at = NULL,
      redistribution_count = COALESCE(redistribution_count, 0) + 1
  WHERE id = p_lead_id;
  
  -- Chamar handle_lead_intake para redistribuir
  SELECT public.handle_lead_intake(p_lead_id) INTO v_result;
  
  -- Atualizar histórico com o novo usuário usando o ID capturado
  IF v_result->>'assigned_user_id' IS NOT NULL THEN
    UPDATE lead_pool_history 
    SET to_user_id = (v_result->>'assigned_user_id')::uuid
    WHERE id = v_history_id;
  END IF;
  
  -- Criar notificação para o antigo usuário
  IF v_old_user_id IS NOT NULL THEN
    PERFORM public.create_notification(
      v_old_user_id,
      'Lead redistribuído',
      'O lead "' || v_lead.name || '" foi redistribuído por inatividade.',
      'warning'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'from_user_id', v_old_user_id,
    'to_user_id', v_result->>'assigned_user_id',
    'redistribution_count', v_lead.redistribution_count + 1
  );
END;
$function$;