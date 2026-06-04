-- Primeiro dropar a função existente, depois recriar
DROP FUNCTION IF EXISTS handle_lead_intake(uuid);

-- Recriar função com tabela e colunas corretas
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
  v_source_key text;
BEGIN
  -- Buscar lead
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado: %', p_lead_id;
  END IF;
  
  v_org_id := v_lead.organization_id;
  
  -- Determinar source key para matching
  v_source_key := COALESCE(v_lead.source, 'unknown');
  
  -- Buscar fila de distribuição ativa que corresponda ao source
  SELECT rr.* INTO v_queue
  FROM round_robins rr
  WHERE rr.organization_id = v_org_id
    AND rr.is_active = true
    AND (
      rr.source_filter IS NULL 
      OR rr.source_filter = '' 
      OR rr.source_filter = v_source_key
      OR v_source_key ILIKE '%' || rr.source_filter || '%'
      OR rr.source_filter ILIKE '%' || v_source_key || '%'
    )
  ORDER BY 
    CASE WHEN rr.source_filter IS NOT NULL AND rr.source_filter != '' THEN 0 ELSE 1 END,
    rr.created_at DESC
  LIMIT 1;
  
  -- Se não encontrou fila, lead vai pro pool
  IF v_queue IS NULL THEN
    UPDATE leads 
    SET 
      user_id = NULL,
      updated_at = now()
    WHERE id = p_lead_id;
    
    -- Criar evento de timeline mesmo sem distribuição
    INSERT INTO lead_timeline_events (
      lead_id, 
      organization_id, 
      user_id, 
      event_type, 
      title, 
      description, 
      metadata
    )
    VALUES (
      p_lead_id,
      v_org_id,
      NULL,
      'lead_created',
      'Lead criado',
      'Lead criado e enviado para o Pool (sem fila de distribuição)',
      jsonb_build_object(
        'source', v_lead.source,
        'sent_to_pool', true
      )
    );
    
    RETURN;
  END IF;
  
  -- Selecionar próximo usuário do round robin usando leads_count e position
  SELECT rrm.user_id INTO v_next_user_id
  FROM round_robin_members rrm
  JOIN users u ON u.id = rrm.user_id
  WHERE rrm.round_robin_id = v_queue.id
    AND u.is_active = true
  ORDER BY rrm.leads_count ASC NULLS FIRST, rrm.position ASC
  LIMIT 1;
  
  -- Se não há usuários disponíveis, vai pro pool
  IF v_next_user_id IS NULL THEN
    UPDATE leads 
    SET 
      user_id = NULL,
      pipeline_id = v_queue.target_pipeline_id,
      stage_id = v_queue.target_stage_id,
      updated_at = now()
    WHERE id = p_lead_id;
    
    INSERT INTO lead_timeline_events (
      lead_id, 
      organization_id, 
      user_id, 
      event_type, 
      title, 
      description, 
      metadata
    )
    VALUES (
      p_lead_id,
      v_org_id,
      NULL,
      'lead_created',
      'Lead criado',
      'Lead criado e enviado para o Pool (sem usuários disponíveis)',
      jsonb_build_object(
        'source', v_lead.source,
        'pipeline_id', v_queue.target_pipeline_id,
        'stage_id', v_queue.target_stage_id,
        'sent_to_pool', true
      )
    );
    
    RETURN;
  END IF;
  
  -- Atribuir lead ao usuário
  UPDATE leads 
  SET 
    user_id = v_next_user_id,
    pipeline_id = v_queue.target_pipeline_id,
    stage_id = v_queue.target_stage_id,
    updated_at = now()
  WHERE id = p_lead_id;
  
  -- Atualizar contador do round robin
  UPDATE round_robin_members
  SET leads_count = COALESCE(leads_count, 0) + 1
  WHERE round_robin_id = v_queue.id AND user_id = v_next_user_id;
  
  -- Registrar log de atribuição
  INSERT INTO assignments_log (
    lead_id,
    organization_id,
    assigned_user_id,
    round_robin_id,
    reason
  ) VALUES (
    p_lead_id,
    v_org_id,
    v_next_user_id,
    v_queue.id,
    'Distribuição automática via Round Robin'
  );
  
  -- Criar evento de timeline com tabela e colunas CORRETAS
  INSERT INTO lead_timeline_events (
    lead_id, 
    organization_id, 
    user_id, 
    event_type, 
    title, 
    description, 
    metadata
  )
  VALUES (
    p_lead_id,
    v_org_id,
    v_next_user_id,
    'lead_created',
    'Lead criado',
    'Lead criado e distribuído automaticamente via Round Robin',
    jsonb_build_object(
      'source', v_lead.source,
      'pipeline_id', v_queue.target_pipeline_id,
      'stage_id', v_queue.target_stage_id,
      'assigned_user_id', v_next_user_id,
      'round_robin_id', v_queue.id
    )
  );
  
  -- Criar atividade para histórico
  INSERT INTO activities (
    lead_id,
    user_id,
    type,
    content,
    metadata
  ) VALUES (
    p_lead_id,
    v_next_user_id,
    'lead_created',
    'Lead criado e distribuído automaticamente',
    jsonb_build_object(
      'source', v_lead.source,
      'pipeline_id', v_queue.target_pipeline_id,
      'stage_id', v_queue.target_stage_id,
      'is_initial_distribution', true
    )
  );
  
END;
$$;