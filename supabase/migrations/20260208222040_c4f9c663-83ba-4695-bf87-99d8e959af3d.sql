-- Corrigir handle_lead_intake para usar pick_round_robin_for_lead
-- Isso resolve o erro "column rr.source_filter does not exist"

DROP FUNCTION IF EXISTS handle_lead_intake(uuid);

CREATE OR REPLACE FUNCTION handle_lead_intake(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_org_id uuid;
  v_queue RECORD;
  v_next_user_id uuid;
  v_matched_queue_id uuid;
BEGIN
  -- Buscar lead
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado: %', p_lead_id;
  END IF;
  
  v_org_id := v_lead.organization_id;
  
  -- Se lead já tem responsável, não fazer nada
  IF v_lead.assigned_user_id IS NOT NULL THEN
    RETURN;
  END IF;
  
  -- Usar a função centralizada de matching que já funciona
  v_matched_queue_id := pick_round_robin_for_lead(p_lead_id);
  
  -- Buscar dados da fila
  IF v_matched_queue_id IS NOT NULL THEN
    SELECT * INTO v_queue 
    FROM round_robins 
    WHERE id = v_matched_queue_id AND is_active = true;
  END IF;
  
  -- Se não encontrou fila ativa, lead vai pro pool
  IF v_queue IS NULL THEN
    INSERT INTO lead_timeline_events (
      lead_id, organization_id, user_id, event_type, title, description, metadata
    ) VALUES (
      p_lead_id, v_org_id, NULL, 'lead_created',
      'Lead criado',
      'Lead enviado para o Pool - nenhuma fila de distribuição ativa encontrada',
      jsonb_build_object(
        'source', v_lead.source,
        'destination', 'pool',
        'reason', 'no_active_queue'
      )
    );
    RETURN;
  END IF;
  
  -- Selecionar próximo usuário usando leads_count e position
  SELECT rrm.user_id INTO v_next_user_id
  FROM round_robin_members rrm
  JOIN users u ON u.id = rrm.user_id
  WHERE rrm.round_robin_id = v_queue.id
    AND u.is_active = true
  ORDER BY rrm.leads_count ASC NULLS FIRST, rrm.position ASC
  LIMIT 1;
  
  -- Se não há membros ativos, lead vai pro pool
  IF v_next_user_id IS NULL THEN
    INSERT INTO lead_timeline_events (
      lead_id, organization_id, user_id, event_type, title, description, metadata
    ) VALUES (
      p_lead_id, v_org_id, NULL, 'lead_created',
      'Lead criado',
      'Lead enviado para o Pool - fila sem membros ativos',
      jsonb_build_object(
        'source', v_lead.source,
        'destination', 'pool',
        'queue_name', v_queue.name,
        'reason', 'no_active_members'
      )
    );
    RETURN;
  END IF;
  
  -- Atribuir lead ao usuário selecionado
  UPDATE leads SET 
    assigned_user_id = v_next_user_id,
    pipeline_id = COALESCE(v_queue.target_pipeline_id, v_lead.pipeline_id),
    stage_id = COALESCE(v_queue.target_stage_id, v_lead.stage_id),
    updated_at = now()
  WHERE id = p_lead_id;
  
  -- Incrementar contador do membro
  UPDATE round_robin_members 
  SET leads_count = COALESCE(leads_count, 0) + 1
  WHERE round_robin_id = v_queue.id AND user_id = v_next_user_id;
  
  -- Registrar atribuição no log
  INSERT INTO assignments_log (
    lead_id, organization_id, round_robin_id, assigned_user_id, reason
  ) VALUES (
    p_lead_id, v_org_id, v_queue.id, v_next_user_id, 'round_robin_auto'
  );
  
  -- Registrar na timeline
  INSERT INTO lead_timeline_events (
    lead_id, organization_id, user_id, event_type, title, description, metadata
  ) VALUES (
    p_lead_id, v_org_id, v_next_user_id, 'lead_created',
    'Lead criado',
    'Lead criado e distribuído automaticamente via Round Robin',
    jsonb_build_object(
      'source', v_lead.source,
      'queue_name', v_queue.name,
      'queue_id', v_queue.id,
      'assigned_user_id', v_next_user_id
    )
  );
  
END;
$$;