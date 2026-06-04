-- =====================================================
-- LEAD INTAKE ENGINE - Motor Único de Entrada de Lead
-- =====================================================

-- 1. Adicionar campo leads_count em round_robin_members (se não existir)
ALTER TABLE public.round_robin_members 
ADD COLUMN IF NOT EXISTS leads_count integer DEFAULT 0;

-- 2. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_round_robins_org_active 
ON public.round_robins(organization_id, is_active) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_round_robin_rules_rr_id 
ON public.round_robin_rules(round_robin_id);

CREATE INDEX IF NOT EXISTS idx_lead_timeline_events_lead_id 
ON public.lead_timeline_events(lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_timeline_events_event_type 
ON public.lead_timeline_events(lead_id, event_type);

CREATE INDEX IF NOT EXISTS idx_activities_lead_type 
ON public.activities(lead_id, type);

-- 3. Função principal: handle_lead_intake
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
  v_round_robin RECORD;
  v_next_member RECORD;
  v_next_index int;
  v_assigned_user_id uuid;
  v_has_lead_created_event boolean := false;
  v_result jsonb;
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
    -- Buscar round-robin ativo que match com source ou pipeline
    -- Prioridade: regras específicas > round-robin geral
    SELECT rr.* INTO v_round_robin
    FROM public.round_robins rr
    WHERE rr.organization_id = v_org_id
      AND rr.is_active = true
      AND (
        -- Match por source
        EXISTS (
          SELECT 1 FROM public.round_robin_rules rrr 
          WHERE rrr.round_robin_id = rr.id 
            AND rrr.match_type = 'source' 
            AND rrr.match_value = v_lead.source::text
        )
        -- Ou match por pipeline (se existir regra)
        OR EXISTS (
          SELECT 1 FROM public.round_robin_rules rrr 
          WHERE rrr.round_robin_id = rr.id 
            AND rrr.match_type = 'pipeline' 
            AND rrr.match_value = v_lead.pipeline_id::text
        )
        -- Ou não tem regras (round-robin genérico/fallback)
        OR NOT EXISTS (
          SELECT 1 FROM public.round_robin_rules rrr 
          WHERE rrr.round_robin_id = rr.id
        )
      )
    ORDER BY 
      -- Priorizar round-robins com regras específicas
      CASE WHEN EXISTS (
        SELECT 1 FROM public.round_robin_rules rrr WHERE rrr.round_robin_id = rr.id
      ) THEN 0 ELSE 1 END,
      rr.created_at
    LIMIT 1;
    
    IF v_round_robin.id IS NOT NULL THEN
      -- Buscar próximo membro baseado em strategy
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
        
        -- Atualizar lead
        UPDATE public.leads 
        SET assigned_user_id = v_assigned_user_id 
        WHERE id = p_lead_id;
        
        -- Atualizar round-robin
        UPDATE public.round_robins 
        SET last_assigned_index = v_next_index 
        WHERE id = v_round_robin.id;
        
        -- Incrementar contador do membro
        UPDATE public.round_robin_members 
        SET leads_count = COALESCE(leads_count, 0) + 1 
        WHERE id = v_next_member.id;
        
        -- Registrar em assignments_log
        INSERT INTO public.assignments_log (lead_id, round_robin_id, assigned_user_id)
        VALUES (p_lead_id, v_round_robin.id, v_assigned_user_id);
        
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
            'round_robin_name', v_round_robin.name
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
            'round_robin_id', v_round_robin.id
          )
        );
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
    'round_robin_used', v_round_robin.id IS NOT NULL
  );
  
  RETURN v_result;
END;
$$;

-- 4. Trigger function para AFTER INSERT
CREATE OR REPLACE FUNCTION public.trigger_handle_lead_intake()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.handle_lead_intake(NEW.id);
  RETURN NEW;
END;
$$;

-- Criar trigger
DROP TRIGGER IF EXISTS trigger_lead_intake ON public.leads;
CREATE TRIGGER trigger_lead_intake
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_handle_lead_intake();

-- 5. Trigger para registrar mudança de estágio na timeline
CREATE OR REPLACE FUNCTION public.log_stage_change_to_timeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_stage_name text;
  v_new_stage_name text;
BEGIN
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    SELECT name INTO v_old_stage_name FROM public.stages WHERE id = OLD.stage_id;
    SELECT name INTO v_new_stage_name FROM public.stages WHERE id = NEW.stage_id;
    
    INSERT INTO public.lead_timeline_events (
      organization_id, lead_id, event_type, event_at, 
      actor_user_id, channel, metadata
    ) VALUES (
      NEW.organization_id, NEW.id, 'stage_changed', now(),
      auth.uid(), 'manual',
      jsonb_build_object(
        'old_stage_id', OLD.stage_id,
        'new_stage_id', NEW.stage_id,
        'old_stage_name', v_old_stage_name,
        'new_stage_name', v_new_stage_name
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_stage_change_timeline ON public.leads;
CREATE TRIGGER trigger_log_stage_change_timeline
  AFTER UPDATE OF stage_id ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.log_stage_change_to_timeline();

-- 6. Trigger para registrar mudança de responsável na timeline
CREATE OR REPLACE FUNCTION public.log_assignee_change_to_timeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Só registra se não foi via round-robin (handle_lead_intake já registra)
  -- Verifica se foi mudança manual (assigned_user_id mudou mas não foi via trigger de insert)
  IF OLD.assigned_user_id IS DISTINCT FROM NEW.assigned_user_id THEN
    -- Verifica se já não foi registrado pelo handle_lead_intake (dentro de 2 segundos)
    IF NOT EXISTS (
      SELECT 1 FROM public.lead_timeline_events 
      WHERE lead_id = NEW.id 
        AND event_type = 'lead_assigned'
        AND metadata->>'new_user_id' = COALESCE(NEW.assigned_user_id::text, 'null')
        AND created_at > now() - interval '2 seconds'
    ) THEN
      INSERT INTO public.lead_timeline_events (
        organization_id, lead_id, event_type, event_at, 
        actor_user_id, channel, metadata
      ) VALUES (
        NEW.organization_id, NEW.id, 'lead_assigned', now(),
        auth.uid(), 'manual',
        jsonb_build_object(
          'previous_user_id', OLD.assigned_user_id,
          'new_user_id', NEW.assigned_user_id,
          'via', 'manual'
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_assignee_change_timeline ON public.leads;
CREATE TRIGGER trigger_log_assignee_change_timeline
  AFTER UPDATE OF assigned_user_id ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.log_assignee_change_to_timeline();