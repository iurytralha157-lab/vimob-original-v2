-- Fase 1: Migração para Sistema de Distribuição Avançado

-- 1. Adicionar colunas de interesse na tabela leads
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS interest_property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS interest_plan_id uuid REFERENCES public.service_plans(id) ON DELETE SET NULL;

-- 2. Adicionar colunas de destino e configurações na tabela round_robins
ALTER TABLE public.round_robins
ADD COLUMN IF NOT EXISTS target_pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS target_stage_id uuid REFERENCES public.stages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}'::jsonb;

-- 3. Adicionar coluna match JSONB na round_robin_rules se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'round_robin_rules' 
    AND column_name = 'match'
  ) THEN
    ALTER TABLE public.round_robin_rules ADD COLUMN match jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- 4. Adicionar coluna priority se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'round_robin_rules' 
    AND column_name = 'priority'
  ) THEN
    ALTER TABLE public.round_robin_rules ADD COLUMN priority integer DEFAULT 0;
  END IF;
END $$;

-- 5. Adicionar coluna is_active se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'round_robin_rules' 
    AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.round_robin_rules ADD COLUMN is_active boolean DEFAULT true;
  END IF;
END $$;

-- 6. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_leads_interest_property ON public.leads(interest_property_id) WHERE interest_property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_interest_plan ON public.leads(interest_plan_id) WHERE interest_plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_round_robins_target_pipeline ON public.round_robins(target_pipeline_id) WHERE target_pipeline_id IS NOT NULL;

-- 7. Atualizar a função pick_round_robin_for_lead para usar o novo campo match JSONB
CREATE OR REPLACE FUNCTION public.pick_round_robin_for_lead(p_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE 
  v_lead RECORD; 
  v_rule RECORD; 
  v_round_robin_id UUID; 
  v_lead_source TEXT; 
  v_lead_tags TEXT[];
  v_match JSONB;
  v_current_day INT;
  v_current_time TIME;
  v_schedule JSONB;
BEGIN
  -- Buscar dados do lead
  SELECT l.*, p.default_round_robin_id, lm.campaign_id
  INTO v_lead 
  FROM public.leads l 
  LEFT JOIN public.pipelines p ON p.id = l.pipeline_id 
  LEFT JOIN public.lead_meta lm ON lm.lead_id = l.id
  WHERE l.id = p_lead_id;
  
  IF NOT FOUND THEN RETURN NULL; END IF;
  
  v_lead_source := v_lead.source::TEXT;
  v_current_day := EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Sao_Paulo')::INT;
  v_current_time := (NOW() AT TIME ZONE 'America/Sao_Paulo')::TIME;
  
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
      IF v_rule.match_type = 'pipeline' AND v_lead.pipeline_id::TEXT = v_rule.match_value THEN 
        RETURN v_rule.round_robin_id; 
      END IF;
      IF v_rule.match_type = 'tag' AND v_lead_tags IS NOT NULL AND v_rule.match_value = ANY(v_lead_tags) THEN 
        RETURN v_rule.round_robin_id; 
      END IF;
      CONTINUE;
    END IF;
    
    -- Avaliar novo formato match JSONB
    -- Verificar source
    IF v_match ? 'source' THEN
      IF NOT (v_lead_source = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'source')))) THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- Verificar campaign_contains (busca no campaign_id da lead_meta)
    IF v_match ? 'campaign_name_contains' THEN
      IF v_lead.campaign_id IS NULL OR 
         NOT (v_lead.campaign_id ILIKE '%' || (v_match->>'campaign_name_contains') || '%') THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- Verificar tags
    IF v_match ? 'tag_in' THEN
      IF v_lead_tags IS NULL OR NOT (
        SELECT bool_or(tag = ANY(v_lead_tags))
        FROM jsonb_array_elements_text(v_match->'tag_in') AS tag
      ) THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- Verificar cidade
    IF v_match ? 'city_in' THEN
      IF v_lead.city IS NULL OR NOT (
        v_lead.city = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'city_in')))
      ) THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- Verificar interesse em imóvel
    IF v_match ? 'interest_property_id' THEN
      IF v_lead.interest_property_id IS NULL OR 
         v_lead.interest_property_id::TEXT != (v_match->>'interest_property_id') THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- Verificar interesse em plano
    IF v_match ? 'interest_plan_id' THEN
      IF v_lead.interest_plan_id IS NULL OR 
         v_lead.interest_plan_id::TEXT != (v_match->>'interest_plan_id') THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- Verificar schedule (horário)
    IF v_match ? 'schedule' THEN
      v_schedule := v_match->'schedule';
      
      -- Verificar dia da semana
      IF v_schedule ? 'days' THEN
        IF NOT (v_current_day = ANY(ARRAY(
          SELECT (jsonb_array_elements_text(v_schedule->'days'))::INT
        ))) THEN
          CONTINUE;
        END IF;
      END IF;
      
      -- Verificar horário
      IF v_schedule ? 'start' AND v_schedule ? 'end' THEN
        IF v_current_time < (v_schedule->>'start')::TIME OR 
           v_current_time > (v_schedule->>'end')::TIME THEN
          CONTINUE;
        END IF;
      END IF;
    END IF;
    
    -- Todas as condições passaram, retornar esta fila
    RETURN v_rule.round_robin_id;
  END LOOP;
  
  -- Fallback: fila padrão do pipeline
  IF v_lead.default_round_robin_id IS NOT NULL THEN 
    SELECT id INTO v_round_robin_id 
    FROM public.round_robins 
    WHERE id = v_lead.default_round_robin_id AND is_active = true; 
    IF FOUND THEN RETURN v_round_robin_id; END IF; 
  END IF;
  
  -- Fallback final: primeira fila ativa sem regras da organização
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

-- 8. Atualizar handle_lead_intake para definir pipeline/stage da fila
CREATE OR REPLACE FUNCTION public.handle_lead_intake(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_lead RECORD;
  v_queue RECORD;
  v_member RECORD;
  v_assigned_user_id uuid;
  v_next_index int;
  v_member_count int;
  v_attempts int := 0;
  v_max_attempts int := 100;
  v_round_robin_id uuid;
  v_target_pipeline_id uuid;
  v_target_stage_id uuid;
BEGIN
  -- 1. Get lead data
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead not found');
  END IF;
  
  IF v_lead.assigned_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'message', 'Lead already assigned', 'assigned_user_id', v_lead.assigned_user_id);
  END IF;

  -- 2. Find active round-robin queue using rules or default
  v_round_robin_id := public.pick_round_robin_for_lead(p_lead_id);
  
  IF v_round_robin_id IS NULL THEN
    -- Fallback: find any active queue for the organization
    SELECT * INTO v_queue
    FROM round_robins
    WHERE organization_id = v_lead.organization_id
      AND is_active = true
    ORDER BY created_at ASC
    LIMIT 1;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'No active round-robin queue');
    END IF;
    
    v_round_robin_id := v_queue.id;
  ELSE
    SELECT * INTO v_queue FROM round_robins WHERE id = v_round_robin_id;
  END IF;

  -- Capturar pipeline/stage de destino da fila
  v_target_pipeline_id := v_queue.target_pipeline_id;
  v_target_stage_id := v_queue.target_stage_id;
  
  -- Se a fila tem pipeline mas não tem stage, pegar o primeiro stage do pipeline
  IF v_target_pipeline_id IS NOT NULL AND v_target_stage_id IS NULL THEN
    SELECT id INTO v_target_stage_id
    FROM stages
    WHERE pipeline_id = v_target_pipeline_id
    ORDER BY position ASC
    LIMIT 1;
  END IF;

  -- 3. Count members in this queue (incluindo membros de equipes)
  SELECT COUNT(DISTINCT user_id) INTO v_member_count
  FROM (
    -- Membros diretos
    SELECT rrm.user_id
    FROM round_robin_members rrm
    WHERE rrm.round_robin_id = v_round_robin_id AND rrm.user_id IS NOT NULL
    UNION
    -- Membros via equipe
    SELECT tm.user_id
    FROM round_robin_members rrm
    JOIN team_members tm ON tm.team_id = rrm.team_id
    WHERE rrm.round_robin_id = v_round_robin_id AND rrm.team_id IS NOT NULL
  ) all_members;

  IF v_member_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No members in queue');
  END IF;

  -- 4. Loop through members to find an available one
  v_next_index := COALESCE(v_queue.last_assigned_index, 0);
  
  WHILE v_attempts < v_max_attempts AND v_attempts < v_member_count * 2 LOOP
    v_next_index := (v_next_index % v_member_count) + 1;
    v_attempts := v_attempts + 1;
    
    -- Get member at this position (incluindo membros de equipes)
    SELECT am.user_id, u.name as user_name INTO v_member
    FROM (
      SELECT rrm.user_id, rrm.position
      FROM round_robin_members rrm
      WHERE rrm.round_robin_id = v_round_robin_id AND rrm.user_id IS NOT NULL
      UNION
      SELECT tm.user_id, rrm.position
      FROM round_robin_members rrm
      JOIN team_members tm ON tm.team_id = rrm.team_id
      WHERE rrm.round_robin_id = v_round_robin_id AND rrm.team_id IS NOT NULL
    ) am
    JOIN users u ON u.id = am.user_id
    ORDER BY am.position ASC
    OFFSET (v_next_index - 1)
    LIMIT 1;
    
    IF NOT FOUND THEN
      CONTINUE;
    END IF;
    
    -- Checar disponibilidade do membro
    IF NOT public.is_member_available(v_member.user_id) THEN
      CONTINUE;
    END IF;
    
    -- Membro disponível! Atribuir o lead
    v_assigned_user_id := v_member.user_id;
    EXIT;
  END LOOP;
  
  IF v_assigned_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No available members at this time');
  END IF;

  -- 5. Update lead with assigned user AND pipeline/stage from queue
  UPDATE leads 
  SET assigned_user_id = v_assigned_user_id,
      assigned_at = NOW(),
      pipeline_id = COALESCE(v_target_pipeline_id, pipeline_id),
      stage_id = COALESCE(v_target_stage_id, stage_id),
      stage_entered_at = CASE WHEN v_target_stage_id IS NOT NULL THEN NOW() ELSE stage_entered_at END
  WHERE id = p_lead_id;
  
  -- 6. Update queue's last assigned index
  UPDATE round_robins
  SET last_assigned_index = v_next_index
  WHERE id = v_round_robin_id;
  
  -- 7. Log assignment
  INSERT INTO assignments_log (lead_id, assigned_user_id, round_robin_id, organization_id, reason)
  VALUES (p_lead_id, v_assigned_user_id, v_round_robin_id, v_lead.organization_id, 'round_robin');

  RETURN jsonb_build_object(
    'success', true, 
    'assigned_user_id', v_assigned_user_id,
    'round_robin_id', v_round_robin_id,
    'target_pipeline_id', v_target_pipeline_id,
    'target_stage_id', v_target_stage_id,
    'attempts', v_attempts
  );
END;
$function$;