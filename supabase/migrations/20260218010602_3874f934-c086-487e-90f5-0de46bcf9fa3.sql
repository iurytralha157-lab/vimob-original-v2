
-- ============================================
-- 1. Reescrever handle_lead_intake com round-robin sequencial verdadeiro
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_lead_intake(p_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead RECORD;
  v_org_id uuid;
  v_queue RECORD;
  v_next_user_id uuid;
  v_matched_queue_id uuid;
  v_admin_id uuid;
  v_next_user_name text;
  v_total_members integer;
  v_next_position integer;
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

  -- ============================================
  -- PASSO 1: Registrar SEMPRE o evento lead_created primeiro
  -- ============================================
  INSERT INTO lead_timeline_events (
    lead_id, organization_id, user_id, event_type, title, description, metadata
  ) VALUES (
    p_lead_id, v_org_id, NULL, 'lead_created',
    'Lead criado',
    'Lead recebido no sistema',
    jsonb_build_object(
      'source', v_lead.source,
      'source_label', CASE v_lead.source
        WHEN 'meta_ads' THEN 'Meta Ads'
        WHEN 'whatsapp' THEN 'WhatsApp'
        WHEN 'webhook' THEN 'Webhook'
        WHEN 'website' THEN 'Site'
        WHEN 'manual' THEN 'Manual'
        ELSE COALESCE(v_lead.source, 'manual')
      END
    )
  );
  
  -- Usar a função centralizada de matching
  v_matched_queue_id := pick_round_robin_for_lead(p_lead_id);
  
  -- Buscar dados da fila
  IF v_matched_queue_id IS NOT NULL THEN
    SELECT * INTO v_queue 
    FROM round_robins 
    WHERE id = v_matched_queue_id AND is_active = true;
  END IF;
  
  -- FALLBACK 1: Se não encontrou fila ativa
  IF v_queue IS NULL THEN
    SELECT id INTO v_admin_id
    FROM users
    WHERE organization_id = v_org_id
      AND role = 'admin'
      AND is_active = true
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_admin_id IS NOT NULL THEN
      SELECT name INTO v_next_user_name FROM users WHERE id = v_admin_id;
      
      UPDATE leads SET
        assigned_user_id = v_admin_id,
        updated_at = now()
      WHERE id = p_lead_id;

      INSERT INTO lead_timeline_events (
        lead_id, organization_id, user_id, event_type, title, description, metadata
      ) VALUES (
        p_lead_id, v_org_id, v_admin_id, 'lead_assigned',
        'Atribuído ao administrador',
        'Nenhuma fila de distribuição ativa. Atribuído a ' || COALESCE(v_next_user_name, 'administrador'),
        jsonb_build_object(
          'destination', 'admin_fallback',
          'reason', 'no_active_queue',
          'assigned_user_id', v_admin_id,
          'assigned_user_name', v_next_user_name
        )
      );

      PERFORM public.notify_whatsapp_on_lead(v_org_id, v_admin_id, v_lead.name, v_lead.source);
    ELSE
      INSERT INTO lead_timeline_events (
        lead_id, organization_id, user_id, event_type, title, description, metadata
      ) VALUES (
        p_lead_id, v_org_id, NULL, 'lead_assigned',
        'Enviado para o Pool',
        'Nenhuma fila ativa e nenhum admin encontrado',
        jsonb_build_object(
          'destination', 'pool',
          'reason', 'no_active_queue_no_admin'
        )
      );
    END IF;
    RETURN;
  END IF;
  
  -- ============================================
  -- ROUND-ROBIN SEQUENCIAL VERDADEIRO
  -- ============================================
  
  -- Contar total de membros ativos na fila
  SELECT COUNT(*) INTO v_total_members
  FROM round_robin_members rrm
  JOIN users u ON u.id = rrm.user_id
  WHERE rrm.round_robin_id = v_queue.id
    AND u.is_active = true;
  
  -- Se tem membros, calcular próxima posição sequencial
  IF v_total_members > 0 THEN
    -- Calcular próxima posição: (last_assigned_index + 1) % total
    v_next_position := (COALESCE(v_queue.last_assigned_index, -1) + 1) % v_total_members;
    
    -- Selecionar membro nessa posição (usando ROW_NUMBER para posição relativa entre ativos)
    SELECT user_id INTO v_next_user_id
    FROM (
      SELECT rrm.user_id, ROW_NUMBER() OVER (ORDER BY rrm.position) - 1 as rn
      FROM round_robin_members rrm
      JOIN users u ON u.id = rrm.user_id
      WHERE rrm.round_robin_id = v_queue.id
        AND u.is_active = true
    ) sub
    WHERE sub.rn = v_next_position;
  END IF;
  
  -- FALLBACK 2: Se fila não tem membros ativos
  IF v_next_user_id IS NULL THEN
    SELECT id INTO v_admin_id
    FROM users
    WHERE organization_id = v_org_id
      AND role = 'admin'
      AND is_active = true
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_admin_id IS NOT NULL THEN
      SELECT name INTO v_next_user_name FROM users WHERE id = v_admin_id;
      
      UPDATE leads SET
        assigned_user_id = v_admin_id,
        updated_at = now()
      WHERE id = p_lead_id;

      INSERT INTO lead_timeline_events (
        lead_id, organization_id, user_id, event_type, title, description, metadata
      ) VALUES (
        p_lead_id, v_org_id, v_admin_id, 'lead_assigned',
        'Atribuído ao administrador',
        'Fila "' || v_queue.name || '" sem membros ativos. Atribuído a ' || COALESCE(v_next_user_name, 'administrador'),
        jsonb_build_object(
          'destination', 'admin_fallback',
          'queue_name', v_queue.name,
          'queue_id', v_queue.id,
          'reason', 'no_active_members',
          'assigned_user_id', v_admin_id,
          'assigned_user_name', v_next_user_name
        )
      );

      PERFORM public.notify_whatsapp_on_lead(v_org_id, v_admin_id, v_lead.name, v_lead.source);
    ELSE
      INSERT INTO lead_timeline_events (
        lead_id, organization_id, user_id, event_type, title, description, metadata
      ) VALUES (
        p_lead_id, v_org_id, NULL, 'lead_assigned',
        'Enviado para o Pool',
        'Fila "' || v_queue.name || '" sem membros ativos e nenhum admin encontrado',
        jsonb_build_object(
          'destination', 'pool',
          'queue_name', v_queue.name,
          'queue_id', v_queue.id,
          'reason', 'no_active_members_no_admin'
        )
      );
    END IF;
    RETURN;
  END IF;
  
  -- Buscar nome do usuário selecionado
  SELECT name INTO v_next_user_name FROM users WHERE id = v_next_user_id;
  
  -- Atribuir lead ao usuário selecionado (fluxo normal Round Robin)
  UPDATE leads SET 
    assigned_user_id = v_next_user_id,
    pipeline_id = COALESCE(v_queue.target_pipeline_id, v_lead.pipeline_id),
    stage_id = COALESCE(v_queue.target_stage_id, v_lead.stage_id),
    updated_at = now()
  WHERE id = p_lead_id;
  
  -- ============================================
  -- Atualizar last_assigned_index para round-robin sequencial
  -- ============================================
  UPDATE round_robins
  SET last_assigned_index = v_next_position
  WHERE id = v_queue.id;
  
  -- Incrementar contador do membro (para estatísticas, não para roteamento)
  UPDATE round_robin_members 
  SET leads_count = COALESCE(leads_count, 0) + 1
  WHERE round_robin_id = v_queue.id AND user_id = v_next_user_id;
  
  -- Registrar atribuição no log
  INSERT INTO assignments_log (
    lead_id, organization_id, round_robin_id, assigned_user_id, reason
  ) VALUES (
    p_lead_id, v_org_id, v_queue.id, v_next_user_id, 'round_robin_auto'
  );
  
  -- ============================================
  -- PASSO 2: Registrar evento de distribuição SEPARADO
  -- ============================================
  INSERT INTO lead_timeline_events (
    lead_id, organization_id, user_id, event_type, title, description, metadata
  ) VALUES (
    p_lead_id, v_org_id, v_next_user_id, 'lead_assigned',
    'Distribuído via "' || v_queue.name || '"',
    'Atribuído a ' || COALESCE(v_next_user_name, 'usuário') || ' pela fila "' || v_queue.name || '"',
    jsonb_build_object(
      'source', v_lead.source,
      'queue_name', v_queue.name,
      'queue_id', v_queue.id,
      'assigned_user_id', v_next_user_id,
      'assigned_user_name', v_next_user_name,
      'distribution_queue_name', v_queue.name,
      'is_initial_distribution', true
    )
  );

  -- Notificar via WhatsApp
  PERFORM public.notify_whatsapp_on_lead(v_org_id, v_next_user_id, v_lead.name, v_lead.source);
  
END;
$function$;

-- ============================================
-- 2. Sincronizar leads_count com dados reais do assignments_log
-- ============================================
UPDATE round_robin_members rrm
SET leads_count = COALESCE(sub.real_count, 0)
FROM (
  SELECT assigned_user_id, round_robin_id, COUNT(*) as real_count
  FROM assignments_log
  GROUP BY round_robin_id, assigned_user_id
) sub
WHERE rrm.round_robin_id = sub.round_robin_id
  AND rrm.user_id = sub.assigned_user_id;
