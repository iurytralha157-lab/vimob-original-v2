-- =============================================
-- FASE 1: Alterações em Tabelas
-- =============================================

-- 1.1 Adicionar campos em round_robin_rules
ALTER TABLE round_robin_rules 
ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id),
ADD COLUMN IF NOT EXISTS priority int DEFAULT 100,
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS match jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS name text;

-- Preencher organization_id das regras existentes baseado no round_robin
UPDATE round_robin_rules rrr
SET organization_id = rr.organization_id
FROM round_robins rr
WHERE rrr.round_robin_id = rr.id
AND rrr.organization_id IS NULL;

-- 1.2 Adicionar assigned_at em leads
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

-- Atualizar leads existentes que têm assigned_user_id
UPDATE leads 
SET assigned_at = updated_at 
WHERE assigned_user_id IS NOT NULL AND assigned_at IS NULL;

-- 1.3 Adicionar default_round_robin_id em pipelines
ALTER TABLE pipelines 
ADD COLUMN IF NOT EXISTS default_round_robin_id uuid REFERENCES round_robins(id);

-- 1.4 Adicionar reason e rule_id em assignments_log
ALTER TABLE assignments_log
ADD COLUMN IF NOT EXISTS reason text DEFAULT 'auto',
ADD COLUMN IF NOT EXISTS rule_id uuid REFERENCES round_robin_rules(id);

-- =============================================
-- FASE 2: Índices para Performance
-- =============================================

CREATE INDEX IF NOT EXISTS idx_leads_org_pipeline_source_assigned 
ON leads(organization_id, pipeline_id, source, assigned_user_id);

CREATE INDEX IF NOT EXISTS idx_leads_assigned_at 
ON leads(assigned_at);

CREATE INDEX IF NOT EXISTS idx_assignments_log_lead_created 
ON assignments_log(lead_id, created_at);

CREATE INDEX IF NOT EXISTS idx_rr_rules_org_active_priority 
ON round_robin_rules(organization_id, is_active, priority);

CREATE INDEX IF NOT EXISTS idx_lead_tags_lead_tag 
ON lead_tags(lead_id, tag_id);

-- =============================================
-- FASE 3: Funções SQL Avançadas
-- =============================================

-- 3.1 Função auxiliar para verificar match de regras
CREATE OR REPLACE FUNCTION public.check_rule_match(
  p_lead RECORD,
  p_lead_tags text[],
  p_match jsonb
)
RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_sources text[];
  v_tag_in text[];
  v_cities text[];
  v_form_ids text[];
  v_schedule jsonb;
  v_now_dow int;
  v_now_time time;
BEGIN
  -- Se match está vazio, é regra genérica (match tudo)
  IF p_match IS NULL OR p_match = '{}'::jsonb THEN
    RETURN true;
  END IF;
  
  -- Verificar pipeline_id
  IF p_match ? 'pipeline_id' AND p_match->>'pipeline_id' IS NOT NULL AND p_match->>'pipeline_id' != '' THEN
    IF p_lead.pipeline_id IS NULL OR p_lead.pipeline_id::text != p_match->>'pipeline_id' THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Verificar source (array)
  IF p_match ? 'source' AND jsonb_array_length(p_match->'source') > 0 THEN
    SELECT array_agg(x) INTO v_sources FROM jsonb_array_elements_text(p_match->'source') x;
    IF NOT (p_lead.source::text = ANY(v_sources)) THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Verificar campaign_name_contains
  IF p_match ? 'campaign_name_contains' AND p_match->>'campaign_name_contains' IS NOT NULL AND p_match->>'campaign_name_contains' != '' THEN
    IF p_lead.campaign_name IS NULL OR 
       NOT (p_lead.campaign_name ILIKE '%' || (p_match->>'campaign_name_contains') || '%') THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Verificar meta_form_id (array)
  IF p_match ? 'meta_form_id' AND jsonb_array_length(p_match->'meta_form_id') > 0 THEN
    SELECT array_agg(x) INTO v_form_ids FROM jsonb_array_elements_text(p_match->'meta_form_id') x;
    IF p_lead.meta_form_id IS NULL OR NOT (p_lead.meta_form_id = ANY(v_form_ids)) THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Verificar tag_in (array) - lead deve ter ALGUMA das tags
  IF p_match ? 'tag_in' AND jsonb_array_length(p_match->'tag_in') > 0 THEN
    SELECT array_agg(lower(x)) INTO v_tag_in FROM jsonb_array_elements_text(p_match->'tag_in') x;
    IF p_lead_tags IS NULL OR array_length(p_lead_tags, 1) IS NULL THEN
      RETURN false;
    END IF;
    -- Verificar interseção (alguma tag em comum)
    IF NOT EXISTS (
      SELECT 1 FROM unnest(p_lead_tags) t WHERE lower(t) = ANY(v_tag_in)
    ) THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Verificar city_in (array)
  IF p_match ? 'city_in' AND jsonb_array_length(p_match->'city_in') > 0 THEN
    SELECT array_agg(lower(x)) INTO v_cities FROM jsonb_array_elements_text(p_match->'city_in') x;
    IF p_lead.cidade IS NULL OR NOT (lower(p_lead.cidade) = ANY(v_cities)) THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Verificar horário/dias (schedule)
  IF p_match ? 'schedule' AND p_match->'schedule' != '{}'::jsonb THEN
    v_schedule := p_match->'schedule';
    v_now_dow := EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo')::int; -- 0=Sunday, 1=Monday...
    v_now_time := (now() AT TIME ZONE 'America/Sao_Paulo')::time;
    
    -- Verificar dia da semana
    IF v_schedule ? 'days' AND jsonb_array_length(v_schedule->'days') > 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_schedule->'days') x 
        WHERE (x::text)::int = v_now_dow
      ) THEN
        RETURN false;
      END IF;
    END IF;
    
    -- Verificar horário
    IF v_schedule ? 'start' AND v_schedule ? 'end' 
       AND v_schedule->>'start' IS NOT NULL AND v_schedule->>'end' IS NOT NULL 
       AND v_schedule->>'start' != '' AND v_schedule->>'end' != '' THEN
      IF v_now_time < (v_schedule->>'start')::time OR 
         v_now_time > (v_schedule->>'end')::time THEN
        RETURN false;
      END IF;
    END IF;
  END IF;
  
  RETURN true;
END;
$$;

-- 3.2 Função para selecionar o round-robin correto
CREATE OR REPLACE FUNCTION public.pick_round_robin_for_lead(p_lead_id uuid)
RETURNS TABLE(round_robin_id uuid, rule_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lead RECORD;
  v_rule RECORD;
  v_lead_tags text[];
  v_result_rr_id uuid;
  v_result_rule_id uuid;
BEGIN
  -- Buscar dados do lead
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF v_lead IS NULL THEN 
    RETURN;
  END IF;
  
  -- Buscar tags do lead (nomes)
  SELECT array_agg(t.name) INTO v_lead_tags
  FROM lead_tags lt
  JOIN tags t ON t.id = lt.tag_id
  WHERE lt.lead_id = p_lead_id;
  
  -- Buscar regras ativas ordenadas por prioridade
  FOR v_rule IN
    SELECT rrr.id as rule_id, rrr.match, rr.id as rr_id
    FROM round_robin_rules rrr
    JOIN round_robins rr ON rr.id = rrr.round_robin_id
    WHERE rrr.organization_id = v_lead.organization_id
      AND rrr.is_active = true
      AND rr.is_active = true
    ORDER BY rrr.priority ASC
  LOOP
    -- Verificar se a regra bate
    IF public.check_rule_match(v_lead, v_lead_tags, v_rule.match) THEN
      round_robin_id := v_rule.rr_id;
      rule_id := v_rule.rule_id;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;
  
  -- Fallback 1: default_round_robin_id do pipeline
  IF v_lead.pipeline_id IS NOT NULL THEN
    SELECT p.default_round_robin_id INTO v_result_rr_id
    FROM pipelines p
    JOIN round_robins rr ON rr.id = p.default_round_robin_id AND rr.is_active = true
    WHERE p.id = v_lead.pipeline_id;
    
    IF v_result_rr_id IS NOT NULL THEN
      round_robin_id := v_result_rr_id;
      rule_id := NULL;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;
  
  -- Fallback 2: round-robin genérico (sem regras ativas) da org
  SELECT rr.id INTO v_result_rr_id
  FROM round_robins rr
  WHERE rr.organization_id = v_lead.organization_id
    AND rr.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM round_robin_rules rrr 
      WHERE rrr.round_robin_id = rr.id AND rrr.is_active = true
    )
  ORDER BY rr.created_at
  LIMIT 1;
  
  IF v_result_rr_id IS NOT NULL THEN
    round_robin_id := v_result_rr_id;
    rule_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;
  
  -- Nenhum round-robin encontrado
  RETURN;
END;
$$;

-- 3.3 Atualizar handle_lead_intake para usar novas funções
CREATE OR REPLACE FUNCTION public.handle_lead_intake(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lead RECORD;
  v_org_id uuid;
  v_default_pipeline_id uuid;
  v_first_stage_id uuid;
  v_rr_result RECORD;
  v_next_member RECORD;
  v_next_index int;
  v_assigned_user_id uuid;
  v_has_lead_created_event boolean := false;
  v_result jsonb;
  v_round_robin RECORD;
BEGIN
  -- 1. Buscar lead atual com lock para evitar race conditions
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  
  IF v_lead IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead not found');
  END IF;
  
  v_org_id := v_lead.organization_id;
  v_assigned_user_id := v_lead.assigned_user_id;
  
  -- Verificar se já existe evento lead_created (idempotência)
  SELECT EXISTS(
    SELECT 1 FROM public.lead_timeline_events 
    WHERE lead_id = p_lead_id AND event_type = 'lead_created'
  ) INTO v_has_lead_created_event;
  
  -- 2. Garantir pipeline_id
  IF v_lead.pipeline_id IS NULL THEN
    SELECT id INTO v_default_pipeline_id
    FROM public.pipelines 
    WHERE organization_id = v_org_id AND is_default = true
    LIMIT 1;
    
    IF v_default_pipeline_id IS NULL THEN
      SELECT id INTO v_default_pipeline_id
      FROM public.pipelines 
      WHERE organization_id = v_org_id
      ORDER BY created_at
      LIMIT 1;
    END IF;
    
    IF v_default_pipeline_id IS NOT NULL THEN
      UPDATE public.leads SET pipeline_id = v_default_pipeline_id WHERE id = p_lead_id;
      v_lead.pipeline_id := v_default_pipeline_id;
    END IF;
  END IF;
  
  -- 3. Garantir stage_id
  IF v_lead.stage_id IS NULL AND v_lead.pipeline_id IS NOT NULL THEN
    SELECT id INTO v_first_stage_id
    FROM public.stages 
    WHERE pipeline_id = v_lead.pipeline_id
    ORDER BY position
    LIMIT 1;
    
    IF v_first_stage_id IS NOT NULL THEN
      UPDATE public.leads 
      SET stage_id = v_first_stage_id, stage_entered_at = now() 
      WHERE id = p_lead_id;
      v_lead.stage_id := v_first_stage_id;
    END IF;
  END IF;
  
  -- 4. Garantir stage_entered_at
  IF v_lead.stage_entered_at IS NULL THEN
    UPDATE public.leads SET stage_entered_at = now() WHERE id = p_lead_id;
  END IF;
  
  -- 5. Atribuição automática via Round-Robin (se não tiver responsável)
  IF v_lead.assigned_user_id IS NULL THEN
    -- Usar nova função pick_round_robin_for_lead
    SELECT * INTO v_rr_result FROM public.pick_round_robin_for_lead(p_lead_id);
    
    IF v_rr_result.round_robin_id IS NOT NULL THEN
      -- Buscar dados do round-robin
      SELECT * INTO v_round_robin FROM public.round_robins WHERE id = v_rr_result.round_robin_id;
      
      IF v_round_robin.id IS NOT NULL THEN
        -- Selecionar próximo membro baseado em strategy
        IF v_round_robin.strategy = 'simple' THEN
          -- Simple round-robin: próximo índice
          SELECT rrm.* INTO v_next_member
          FROM public.round_robin_members rrm
          JOIN public.users u ON u.id = rrm.user_id
          WHERE rrm.round_robin_id = v_round_robin.id
            AND u.is_active = true
          ORDER BY rrm.position
          OFFSET COALESCE(v_round_robin.last_assigned_index, -1) + 1
          LIMIT 1;
          
          -- Se não encontrou, volta ao início
          IF v_next_member IS NULL THEN
            SELECT rrm.* INTO v_next_member
            FROM public.round_robin_members rrm
            JOIN public.users u ON u.id = rrm.user_id
            WHERE rrm.round_robin_id = v_round_robin.id
              AND u.is_active = true
            ORDER BY rrm.position
            LIMIT 1;
          END IF;
          
          v_next_index := COALESCE(v_next_member.position, 0);
          
        ELSE
          -- Weighted round-robin: baseado em peso e leads recebidos
          SELECT rrm.* INTO v_next_member
          FROM public.round_robin_members rrm
          JOIN public.users u ON u.id = rrm.user_id
          WHERE rrm.round_robin_id = v_round_robin.id
            AND u.is_active = true
          ORDER BY 
            (COALESCE(rrm.leads_count, 0)::float / GREATEST(rrm.weight, 1)) ASC,
            rrm.position
          LIMIT 1;
          
          v_next_index := COALESCE(v_next_member.position, 0);
        END IF;
        
        IF v_next_member.user_id IS NOT NULL THEN
          v_assigned_user_id := v_next_member.user_id;
          
          -- Atualizar lead com assigned_at
          UPDATE public.leads 
          SET assigned_user_id = v_assigned_user_id,
              assigned_at = now()
          WHERE id = p_lead_id;
          
          -- Atualizar round-robin
          UPDATE public.round_robins 
          SET last_assigned_index = v_next_index 
          WHERE id = v_round_robin.id;
          
          -- Incrementar contador do membro
          UPDATE public.round_robin_members 
          SET leads_count = COALESCE(leads_count, 0) + 1 
          WHERE id = v_next_member.id;
          
          -- Registrar em assignments_log com reason e rule_id
          INSERT INTO public.assignments_log (lead_id, round_robin_id, assigned_user_id, reason, rule_id)
          VALUES (p_lead_id, v_round_robin.id, v_assigned_user_id, 'auto', v_rr_result.rule_id);
          
          -- Registrar activity
          INSERT INTO public.activities (lead_id, type, content, metadata)
          VALUES (
            p_lead_id, 
            'assignee_changed', 
            'Lead atribuído automaticamente via round-robin',
            jsonb_build_object(
              'from', null,
              'to', v_assigned_user_id,
              'via', 'round_robin',
              'round_robin_id', v_round_robin.id,
              'round_robin_name', v_round_robin.name,
              'rule_id', v_rr_result.rule_id
            )
          );
          
          -- Registrar timeline event
          INSERT INTO public.lead_timeline_events (
            organization_id, lead_id, event_type, event_at, 
            actor_user_id, channel, metadata
          ) VALUES (
            v_org_id, p_lead_id, 'lead_assigned', now(),
            NULL, 'system',
            jsonb_build_object(
              'previous_user_id', null,
              'new_user_id', v_assigned_user_id,
              'via', 'round_robin',
              'round_robin_id', v_round_robin.id,
              'rule_id', v_rr_result.rule_id
            )
          );
        END IF;
      END IF;
    END IF;
  END IF;
  
  -- 6. Registrar lead_created (idempotente)
  IF NOT v_has_lead_created_event THEN
    -- Activity (verificar se não existe)
    INSERT INTO public.activities (lead_id, type, content, metadata)
    SELECT p_lead_id, 'lead_created', 'Lead criado', 
           jsonb_build_object('source', v_lead.source, 'pipeline_id', v_lead.pipeline_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.activities 
      WHERE lead_id = p_lead_id AND type = 'lead_created'
    );
    
    -- Timeline event
    INSERT INTO public.lead_timeline_events (
      organization_id, lead_id, event_type, event_at, 
      channel, metadata
    ) VALUES (
      v_org_id, p_lead_id, 'lead_created', COALESCE(v_lead.created_at, now()),
      v_lead.source::text,
      jsonb_build_object(
        'source', v_lead.source,
        'pipeline_id', v_lead.pipeline_id,
        'stage_id', v_lead.stage_id,
        'name', v_lead.name
      )
    );
  END IF;
  
  -- Resultado
  v_result := jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'pipeline_id', v_lead.pipeline_id,
    'stage_id', v_lead.stage_id,
    'assigned_user_id', v_assigned_user_id,
    'round_robin_id', v_rr_result.round_robin_id,
    'rule_id', v_rr_result.rule_id
  );
  
  RETURN v_result;
END;
$$;

-- 3.4 Função para simular round-robin (teste sem persistir)
CREATE OR REPLACE FUNCTION public.simulate_round_robin(
  p_organization_id uuid,
  p_pipeline_id uuid DEFAULT NULL,
  p_source text DEFAULT 'manual',
  p_campaign_name text DEFAULT NULL,
  p_meta_form_id text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_tags text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lead RECORD;
  v_rule RECORD;
  v_round_robin RECORD;
  v_next_member RECORD;
  v_user RECORD;
BEGIN
  -- Criar um "lead virtual" para simular
  v_lead := ROW(
    NULL::uuid,  -- id
    p_organization_id,
    p_pipeline_id,
    NULL::uuid,  -- stage_id
    p_source::lead_source,
    p_campaign_name,
    p_meta_form_id,
    p_city,  -- cidade
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
  );
  
  -- Buscar regras ativas ordenadas por prioridade
  FOR v_rule IN
    SELECT rrr.id as rule_id, rrr.name as rule_name, rrr.match, rr.id as rr_id, rr.name as rr_name, rr.strategy
    FROM round_robin_rules rrr
    JOIN round_robins rr ON rr.id = rrr.round_robin_id
    WHERE rrr.organization_id = p_organization_id
      AND rrr.is_active = true
      AND rr.is_active = true
    ORDER BY rrr.priority ASC
  LOOP
    -- Verificar se a regra bate
    IF public.check_rule_match(v_lead, p_tags, v_rule.match) THEN
      -- Encontrou a regra, buscar próximo membro
      SELECT * INTO v_round_robin FROM round_robins WHERE id = v_rule.rr_id;
      
      IF v_round_robin.strategy = 'simple' THEN
        SELECT rrm.*, u.name as user_name, u.email as user_email INTO v_next_member
        FROM round_robin_members rrm
        JOIN users u ON u.id = rrm.user_id
        WHERE rrm.round_robin_id = v_round_robin.id AND u.is_active = true
        ORDER BY rrm.position
        OFFSET COALESCE(v_round_robin.last_assigned_index, -1) + 1
        LIMIT 1;
        
        IF v_next_member IS NULL THEN
          SELECT rrm.*, u.name as user_name, u.email as user_email INTO v_next_member
          FROM round_robin_members rrm
          JOIN users u ON u.id = rrm.user_id
          WHERE rrm.round_robin_id = v_round_robin.id AND u.is_active = true
          ORDER BY rrm.position
          LIMIT 1;
        END IF;
      ELSE
        SELECT rrm.*, u.name as user_name, u.email as user_email INTO v_next_member
        FROM round_robin_members rrm
        JOIN users u ON u.id = rrm.user_id
        WHERE rrm.round_robin_id = v_round_robin.id AND u.is_active = true
        ORDER BY (COALESCE(rrm.leads_count, 0)::float / GREATEST(rrm.weight, 1)) ASC, rrm.position
        LIMIT 1;
      END IF;
      
      RETURN jsonb_build_object(
        'matched', true,
        'rule_id', v_rule.rule_id,
        'rule_name', v_rule.rule_name,
        'round_robin_id', v_rule.rr_id,
        'round_robin_name', v_rule.rr_name,
        'strategy', v_rule.strategy,
        'next_user_id', v_next_member.user_id,
        'next_user_name', v_next_member.user_name,
        'next_user_email', v_next_member.user_email
      );
    END IF;
  END LOOP;
  
  -- Fallback: default do pipeline
  IF p_pipeline_id IS NOT NULL THEN
    SELECT rr.* INTO v_round_robin
    FROM pipelines p
    JOIN round_robins rr ON rr.id = p.default_round_robin_id AND rr.is_active = true
    WHERE p.id = p_pipeline_id;
    
    IF v_round_robin.id IS NOT NULL THEN
      IF v_round_robin.strategy = 'simple' THEN
        SELECT rrm.*, u.name as user_name INTO v_next_member
        FROM round_robin_members rrm
        JOIN users u ON u.id = rrm.user_id
        WHERE rrm.round_robin_id = v_round_robin.id AND u.is_active = true
        ORDER BY rrm.position
        OFFSET COALESCE(v_round_robin.last_assigned_index, -1) + 1
        LIMIT 1;
        
        IF v_next_member IS NULL THEN
          SELECT rrm.*, u.name as user_name INTO v_next_member
          FROM round_robin_members rrm
          JOIN users u ON u.id = rrm.user_id
          WHERE rrm.round_robin_id = v_round_robin.id AND u.is_active = true
          ORDER BY rrm.position
          LIMIT 1;
        END IF;
      ELSE
        SELECT rrm.*, u.name as user_name INTO v_next_member
        FROM round_robin_members rrm
        JOIN users u ON u.id = rrm.user_id
        WHERE rrm.round_robin_id = v_round_robin.id AND u.is_active = true
        ORDER BY (COALESCE(rrm.leads_count, 0)::float / GREATEST(rrm.weight, 1)) ASC, rrm.position
        LIMIT 1;
      END IF;
      
      RETURN jsonb_build_object(
        'matched', true,
        'via', 'pipeline_default',
        'round_robin_id', v_round_robin.id,
        'round_robin_name', v_round_robin.name,
        'strategy', v_round_robin.strategy,
        'next_user_id', v_next_member.user_id,
        'next_user_name', v_next_member.user_name
      );
    END IF;
  END IF;
  
  -- Fallback: round-robin genérico
  SELECT rr.* INTO v_round_robin
  FROM round_robins rr
  WHERE rr.organization_id = p_organization_id
    AND rr.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM round_robin_rules rrr 
      WHERE rrr.round_robin_id = rr.id AND rrr.is_active = true
    )
  ORDER BY rr.created_at
  LIMIT 1;
  
  IF v_round_robin.id IS NOT NULL THEN
    SELECT rrm.*, u.name as user_name INTO v_next_member
    FROM round_robin_members rrm
    JOIN users u ON u.id = rrm.user_id
    WHERE rrm.round_robin_id = v_round_robin.id AND u.is_active = true
    ORDER BY rrm.position
    LIMIT 1;
    
    RETURN jsonb_build_object(
      'matched', true,
      'via', 'fallback_generic',
      'round_robin_id', v_round_robin.id,
      'round_robin_name', v_round_robin.name,
      'next_user_id', v_next_member.user_id,
      'next_user_name', v_next_member.user_name
    );
  END IF;
  
  RETURN jsonb_build_object('matched', false, 'message', 'Nenhum round-robin encontrado');
END;
$$;

-- =============================================
-- FASE 4: RLS para round_robin_rules
-- =============================================

ALTER TABLE round_robin_rules ENABLE ROW LEVEL SECURITY;

-- Policy para SELECT
DROP POLICY IF EXISTS "Org members can view rules" ON round_robin_rules;
CREATE POLICY "Org members can view rules"
ON round_robin_rules FOR SELECT
USING (organization_id = auth_org_id() OR is_super_admin());

-- Policy para INSERT/UPDATE/DELETE (admins)
DROP POLICY IF EXISTS "Admins can manage rules" ON round_robin_rules;
CREATE POLICY "Admins can manage rules"
ON round_robin_rules FOR ALL
USING (is_org_admin() OR is_super_admin());

-- =============================================
-- FASE 5: Trigger para auto-preencher organization_id
-- =============================================

CREATE OR REPLACE FUNCTION public.set_rule_organization_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Se organization_id não foi informado, buscar do round_robin
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM round_robins WHERE id = NEW.round_robin_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_rule_org_id ON round_robin_rules;
CREATE TRIGGER set_rule_org_id
BEFORE INSERT ON round_robin_rules
FOR EACH ROW
EXECUTE FUNCTION public.set_rule_organization_id();