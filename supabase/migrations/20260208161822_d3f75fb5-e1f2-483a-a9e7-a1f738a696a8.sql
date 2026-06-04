-- Corrige o erro de coluna actor_id que não existe (deveria ser user_id)
CREATE OR REPLACE FUNCTION public.handle_lead_intake(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_round_robin_id uuid;
  v_round_robin RECORD;
  v_next_user_id uuid;
  v_first_stage_id uuid;
  v_is_redistribution boolean := false;
  v_source_label text;
  v_lead_meta RECORD;
BEGIN
  -- Buscar dados do lead
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  
  IF v_lead IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lead not found');
  END IF;

  -- Verificar se é redistribuição (lead já tinha assigned_user_id)
  v_is_redistribution := v_lead.assigned_user_id IS NOT NULL;

  -- Buscar metadados do lead para enriquecer o histórico
  SELECT * INTO v_lead_meta FROM lead_meta WHERE lead_id = p_lead_id LIMIT 1;

  -- Determinar label da origem
  v_source_label := CASE 
    WHEN v_lead.source = 'meta' THEN 'Meta Ads'
    WHEN v_lead.source = 'webhook' THEN 'Webhook'
    WHEN v_lead.source = 'whatsapp' THEN 'WhatsApp'
    WHEN v_lead.source = 'site' THEN 'Site'
    WHEN v_lead.source = 'manual' THEN 'Manual'
    ELSE COALESCE(v_lead.source, 'Desconhecida')
  END;

  -- Registrar evento de criação do lead ANTES de qualquer distribuição
  -- Isso garante que o histórico de origem seja sempre registrado
  IF NOT v_is_redistribution THEN
    -- Inserir evento de timeline
    INSERT INTO lead_timeline_events (lead_id, event_type, user_id, metadata)
    VALUES (
      p_lead_id, 
      'lead_created', 
      NULL,
      jsonb_build_object(
        'source', v_lead.source,
        'source_label', v_source_label,
        'campaign_name', v_lead_meta.campaign_name,
        'adset_name', v_lead_meta.adset_name,
        'ad_name', v_lead_meta.ad_name,
        'form_name', v_lead_meta.form_name,
        'property_id', v_lead.interest_property_id
      )
    );

    -- Inserir atividade
    INSERT INTO activities (lead_id, type, content, metadata)
    VALUES (
      p_lead_id,
      'lead_created',
      'Lead criado via ' || v_source_label,
      jsonb_build_object(
        'source', v_lead.source,
        'source_label', v_source_label,
        'campaign_name', v_lead_meta.campaign_name,
        'form_name', v_lead_meta.form_name
      )
    );
  END IF;

  -- Buscar regra de distribuição que case com o lead
  SELECT rr.id INTO v_round_robin_id
  FROM round_robins rr
  WHERE rr.organization_id = v_lead.organization_id
    AND rr.is_active = true
    AND (
      -- Regra sem filtro de source (aplica a todos)
      rr.source_filter IS NULL 
      OR rr.source_filter = '{}'::text[]
      -- Regra com filtro que inclui o source do lead
      OR v_lead.source = ANY(rr.source_filter)
    )
  ORDER BY 
    -- Priorizar regras com filtro específico
    CASE WHEN rr.source_filter IS NOT NULL AND rr.source_filter != '{}'::text[] THEN 0 ELSE 1 END,
    rr.created_at
  LIMIT 1;

  -- Se não há regra, retorna - lead fica no pool
  IF v_round_robin_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true, 
      'message', 'No matching distribution rule - lead will remain in pool',
      'lead_created_registered', true
    );
  END IF;

  -- Buscar dados completos da regra
  SELECT * INTO v_round_robin FROM round_robins WHERE id = v_round_robin_id;

  -- Buscar primeiro estágio do pipeline
  SELECT id INTO v_first_stage_id
  FROM stages
  WHERE pipeline_id = v_round_robin.pipeline_id
  ORDER BY position ASC
  LIMIT 1;

  -- Buscar próximo usuário na fila
  SELECT user_id INTO v_next_user_id
  FROM round_robin_members
  WHERE round_robin_id = v_round_robin_id
    AND is_active = true
    AND is_available = true
  ORDER BY last_assigned_at NULLS FIRST, position
  LIMIT 1;

  -- Se não há usuário disponível, apenas coloca no pipeline/stage sem atribuir
  IF v_next_user_id IS NULL THEN
    UPDATE leads
    SET 
      pipeline_id = v_round_robin.pipeline_id,
      stage_id = v_first_stage_id,
      updated_at = NOW()
    WHERE id = p_lead_id;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'No available user - lead assigned to pipeline only',
      'pipeline_id', v_round_robin.pipeline_id,
      'stage_id', v_first_stage_id
    );
  END IF;

  -- Atualizar o lead com pipeline, stage e usuário
  UPDATE leads
  SET 
    pipeline_id = v_round_robin.pipeline_id,
    stage_id = v_first_stage_id,
    assigned_user_id = v_next_user_id,
    updated_at = NOW()
  WHERE id = p_lead_id;

  -- Atualizar last_assigned_at do membro
  UPDATE round_robin_members
  SET last_assigned_at = NOW()
  WHERE round_robin_id = v_round_robin_id
    AND user_id = v_next_user_id;

  -- Registrar no log de atribuições
  INSERT INTO assignments_log (
    lead_id, 
    organization_id, 
    round_robin_id, 
    assigned_user_id, 
    reason
  ) VALUES (
    p_lead_id,
    v_lead.organization_id,
    v_round_robin_id,
    v_next_user_id,
    'Distribuição automática via Round Robin'
  );

  -- Registrar evento de atribuição na timeline
  INSERT INTO lead_timeline_events (lead_id, event_type, user_id, metadata)
  VALUES (
    p_lead_id,
    'assignee_changed',
    NULL,
    jsonb_build_object(
      'new_assignee_id', v_next_user_id,
      'round_robin_id', v_round_robin_id,
      'round_robin_name', v_round_robin.name,
      'distribution_type', 'round_robin'
    )
  );

  -- Registrar entrada no estágio
  INSERT INTO lead_stage_history (lead_id, stage_id, entered_at)
  VALUES (p_lead_id, v_first_stage_id, NOW());

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Lead distributed successfully',
    'assigned_user_id', v_next_user_id,
    'pipeline_id', v_round_robin.pipeline_id,
    'stage_id', v_first_stage_id,
    'round_robin_id', v_round_robin_id
  );
END;
$$;