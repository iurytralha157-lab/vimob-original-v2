-- Fix Lead Distribution Rules
-- 1. Update pick_round_robin_for_lead to remove schedule check
CREATE OR REPLACE FUNCTION public.pick_round_robin_for_lead(p_lead_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
  v_lead RECORD; 
  v_rule RECORD; 
  v_round_robin_id UUID; 
  v_lead_source TEXT; 
  v_lead_tags TEXT[];
  v_match JSONB;
  v_property_category TEXT;
  v_form_id TEXT;
BEGIN
  -- Buscar dados do lead
  SELECT l.*, p.default_round_robin_id, lm.campaign_id, 
         COALESCE(lm.form_id, l.meta_form_id) as resolved_form_id,
         prop.tipo_de_negocio as property_category
  INTO v_lead 
  FROM public.leads l 
  LEFT JOIN public.pipelines p ON p.id = l.pipeline_id 
  LEFT JOIN public.lead_meta lm ON lm.lead_id = l.id
  LEFT JOIN public.properties prop ON prop.id = l.interest_property_id
  WHERE l.id = p_lead_id;
  
  IF NOT FOUND THEN RETURN NULL; END IF;
  
  v_lead_source := v_lead.source::TEXT;
  v_property_category := v_lead.property_category;
  v_form_id := v_lead.resolved_form_id;
  
  -- Buscar tags do lead
  SELECT ARRAY_AGG(t.name) INTO v_lead_tags 
  FROM public.lead_tags lt 
  JOIN public.tags t ON t.id = lt.tag_id 
  WHERE lt.lead_id = p_lead_id;
  
  -- Avaliar regras por prioridade
  FOR v_rule IN 
    SELECT rr.id as round_robin_id, rr.settings, rrr.* 
    FROM public.round_robin_rules rrr 
    JOIN public.round_robins rr ON rr.id = rrr.round_robin_id 
    WHERE rr.organization_id = v_lead.organization_id 
      AND rr.is_active = true 
      AND (rrr.is_active IS NULL OR rrr.is_active = true)
    ORDER BY COALESCE(rrr.priority, 0) DESC
  LOOP
    v_match := COALESCE(v_rule.match, '{}'::jsonb);
    
    -- Se match está vazio, usar match_type/match_value legado
    IF v_match = '{}'::jsonb THEN
      IF v_rule.match_type = 'source' AND v_lead_source = v_rule.match_value THEN 
        RETURN v_rule.round_robin_id; 
      END IF;
      CONTINUE;
    END IF;
    
    -- Filtro por source
    IF v_match ? 'source' AND jsonb_array_length(v_match->'source') > 0 THEN
      IF NOT (v_lead_source = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'source')))) THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- Filtro por webhook_id
    IF v_match ? 'webhook_id' AND jsonb_array_length(v_match->'webhook_id') > 0 THEN
      IF v_lead.source_webhook_id IS NULL OR NOT (v_lead.source_webhook_id::TEXT = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'webhook_id')))) THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- Filtro por whatsapp_session_id
    IF v_match ? 'whatsapp_session_id' AND jsonb_array_length(v_match->'whatsapp_session_id') > 0 THEN
      IF v_lead.source_session_id IS NULL OR NOT (v_lead.source_session_id::TEXT = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'whatsapp_session_id')))) THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- Filtro por meta_form_id
    IF v_match ? 'meta_form_id' AND jsonb_array_length(v_match->'meta_form_id') > 0 THEN
      IF v_form_id IS NULL OR NOT (v_form_id = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'meta_form_id')))) THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- Filtro por website_category
    IF v_match ? 'website_category' AND jsonb_array_length(v_match->'website_category') > 0 THEN
      IF v_property_category IS NULL OR NOT (v_property_category = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'website_category')))) THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- Filtro por campaign_name_contains
    IF v_match ? 'campaign_name_contains' AND v_match->>'campaign_name_contains' IS NOT NULL AND v_match->>'campaign_name_contains' != '' THEN
      IF v_lead.campaign_id IS NULL OR NOT (v_lead.campaign_id ILIKE '%' || (v_match->>'campaign_name_contains') || '%') THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- Filtro por tag_in
    IF v_match ? 'tag_in' AND jsonb_array_length(v_match->'tag_in') > 0 THEN
      IF v_lead_tags IS NULL OR NOT (v_lead_tags && ARRAY(SELECT jsonb_array_elements_text(v_match->'tag_in'))) THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- Filtro por city_in
    IF v_match ? 'city_in' AND jsonb_array_length(v_match->'city_in') > 0 THEN
      IF v_lead.city IS NULL OR NOT (v_lead.city = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'city_in')))) THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- Filtro por interest_property_id
    IF v_match ? 'interest_property_id' AND v_match->>'interest_property_id' IS NOT NULL AND v_match->>'interest_property_id' != '' THEN
      IF v_lead.interest_property_id IS NULL OR v_lead.interest_property_id::TEXT != v_match->>'interest_property_id' THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- Filtro por interest_plan_id
    IF v_match ? 'interest_plan_id' AND v_match->>'interest_plan_id' IS NOT NULL AND v_match->>'interest_plan_id' != '' THEN
      IF v_lead.interest_plan_id IS NULL OR v_lead.interest_plan_id::TEXT != v_match->>'interest_plan_id' THEN
        CONTINUE;
      END IF;
    END IF;

    -- REMOVIDO: Schedule check (v_rule.settings->'schedule')
    -- A fila agora é considerada ativa se rr.is_active = true
    
    -- Passou todos os filtros - retorna esta fila
    RETURN v_rule.round_robin_id;
  END LOOP;
  
  -- Fallback: buscar round-robins SEM regras ativas (catch-all)
  SELECT rr.id INTO v_round_robin_id 
  FROM public.round_robins rr
  WHERE rr.organization_id = v_lead.organization_id 
    AND rr.is_active = true 
    AND NOT EXISTS (
      SELECT 1 FROM public.round_robin_rules rrr 
      WHERE rrr.round_robin_id = rr.id AND (rrr.is_active IS NULL OR rrr.is_active = true)
    )
  ORDER BY rr.created_at ASC 
  LIMIT 1;
  
  RETURN v_round_robin_id;
END;
$function$;

-- 2. Update handle_lead_intake to handle direct users vs teams and remove admin fallback
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
  v_next_user_name text;
  v_member RECORD;
  v_is_available BOOLEAN;
  v_current_day INTEGER;
  v_current_time TIME;
  v_team_member_id UUID;
  v_matched_member_id UUID;
  v_log_reason TEXT;
  v_has_availability_config BOOLEAN;
BEGIN
  -- Data/hora atual para checagem de escala
  v_current_day := EXTRACT(DOW FROM (NOW() AT TIME ZONE 'America/Sao_Paulo'))::INT;
  v_current_time := (NOW() AT TIME ZONE 'America/Sao_Paulo')::TIME;

  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado: %', p_lead_id;
  END IF;
  
  v_org_id := v_lead.organization_id;
  
  -- Se já tem responsável, não faz nada
  IF v_lead.assigned_user_id IS NOT NULL THEN
    RETURN;
  END IF;

  -- Registrar evento inicial se não existir
  IF NOT EXISTS (SELECT 1 FROM lead_timeline_events WHERE lead_id = p_lead_id AND event_type = 'lead_created') THEN
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
  END IF;
  
  -- 1. Tentar encontrar uma fila
  v_matched_queue_id := pick_round_robin_for_lead(p_lead_id);
  
  IF v_matched_queue_id IS NOT NULL THEN
    SELECT * INTO v_queue 
    FROM round_robins 
    WHERE id = v_matched_queue_id AND is_active = true;
  END IF;
  
  -- 2. Se não encontrar fila, logar e sair (SEM fallback para admin)
  IF v_queue IS NULL THEN
    INSERT INTO round_robin_logs (
      organization_id, lead_id, reason
    ) VALUES (
      v_org_id, p_lead_id, 'no_matching_queue'
    );

    INSERT INTO lead_timeline_events (
      lead_id, organization_id, user_id, event_type, title, description, metadata
    ) VALUES (
      p_lead_id, v_org_id, NULL, 'lead_assigned',
      'Aguardando distribuição',
      'Nenhuma fila de distribuição ativa encontrada para as regras deste lead.',
      jsonb_build_object(
        'destination', 'pool',
        'reason', 'no_matching_queue'
      )
    );
    RETURN;
  END IF;
  
  -- 3. Buscar membros da fila e validar disponibilidade
  FOR v_member IN 
    SELECT rrm.*, u.name as user_name, u.is_active as user_active
    FROM round_robin_members rrm
    JOIN users u ON u.id = rrm.user_id
    WHERE rrm.round_robin_id = v_queue.id
      AND u.organization_id = v_org_id
    ORDER BY rrm.leads_count ASC NULLS FIRST, rrm.position ASC
  LOOP
    -- Só processa se usuário estiver ativo
    CONTINUE WHEN NOT v_member.user_active;

    v_is_available := false;
    v_log_reason := NULL;

    -- Regra 2: Usuário direto (team_id NULL) -> 24h
    IF v_member.team_id IS NULL THEN
      v_is_available := true;
      v_log_reason := 'direct_user_24h';
    ELSE
      -- Regra 3: Participante por equipe -> Consultar escala específica da equipe
      SELECT id INTO v_team_member_id 
      FROM public.team_members 
      WHERE user_id = v_member.user_id AND team_id = v_member.team_id
      LIMIT 1;

      IF v_team_member_id IS NULL THEN
        CONTINUE;
      END IF;

      -- Verificar se tem configuração de disponibilidade para esta equipe
      SELECT EXISTS (
        SELECT 1 FROM public.member_availability 
        WHERE team_member_id = v_team_member_id AND is_active = true
      ) INTO v_has_availability_config;

      IF NOT v_has_availability_config THEN
        v_is_available := TRUE;
        v_log_reason := 'team_user_no_schedule_default';
      ELSE
        SELECT EXISTS (
          SELECT 1 FROM public.member_availability
          WHERE team_member_id = v_team_member_id
          AND day_of_week = v_current_day
          AND is_active = true
          AND (
            is_all_day = true
            OR (start_time IS NOT NULL AND end_time IS NOT NULL 
                AND v_current_time BETWEEN start_time AND end_time)
          )
        ) INTO v_is_available;
        
        IF v_is_available THEN
          v_log_reason := 'team_user_within_schedule';
        ELSE
          v_log_reason := 'team_user_outside_schedule';
        END IF;
      END IF;
    END IF;

    IF v_is_available THEN
      v_next_user_id := v_member.user_id;
      v_next_user_name := v_member.user_name;
      v_matched_member_id := v_member.id;
      EXIT;
    END IF;
  END LOOP;
  
  -- 4. Se não encontrar ninguém disponível, logar e sair (SEM fallback para admin)
  IF v_next_user_id IS NULL THEN
    INSERT INTO round_robin_logs (
      organization_id, round_robin_id, lead_id, reason
    ) VALUES (
      v_org_id, v_queue.id, p_lead_id, 'no_available_members'
    );

    INSERT INTO lead_timeline_events (
      lead_id, organization_id, user_id, event_type, title, description, metadata
    ) VALUES (
      p_lead_id, v_org_id, NULL, 'lead_assigned',
      'Aguardando distribuição',
      'Fila "' || v_queue.name || '" sem membros disponíveis no momento.',
      jsonb_build_object(
        'destination', 'pool',
        'queue_name', v_queue.name,
        'queue_id', v_queue.id,
        'reason', 'no_available_members'
      )
    );
    RETURN;
  END IF;
  
  -- 5. Atribuir o lead ao usuário encontrado
  UPDATE leads SET 
    assigned_user_id = v_next_user_id,
    pipeline_id = COALESCE(v_queue.target_pipeline_id, pipeline_id),
    stage_id = COALESCE(v_queue.target_stage_id, stage_id),
    assigned_at = now(),
    updated_at = now()
  WHERE id = p_lead_id;

  UPDATE round_robin_members 
  SET leads_count = COALESCE(leads_count, 0) + 1 
  WHERE id = v_matched_member_id;

  INSERT INTO assignments_log (
    lead_id, organization_id, round_robin_id, assigned_user_id, reason
  ) VALUES (
    p_lead_id, v_org_id, v_queue.id, v_next_user_id, 'round_robin_auto'
  );

  INSERT INTO round_robin_logs (
    organization_id, round_robin_id, lead_id, assigned_user_id, member_id, reason
  ) VALUES (
    v_org_id, v_queue.id, p_lead_id, v_next_user_id, v_matched_member_id, 
    jsonb_build_object(
      'type', CASE WHEN (SELECT team_id FROM round_robin_members WHERE id = v_matched_member_id) IS NULL THEN 'direct' ELSE 'team' END,
      'availability_check', v_log_reason
    )::text
  );

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
      'is_initial_distribution', true
    )
  );

  PERFORM public.notify_whatsapp_on_lead(v_org_id, v_next_user_id, v_lead.name, v_lead.source);

END;
$function$;
