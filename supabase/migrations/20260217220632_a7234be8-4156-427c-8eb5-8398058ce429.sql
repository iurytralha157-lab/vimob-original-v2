
-- Fix pick_round_robin_for_lead to use leads.meta_form_id as fallback
-- when lead_meta hasn't been inserted yet (race condition with meta-webhook)
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
  v_current_day INT;
  v_current_time TIME;
  v_schedule JSONB;
  v_property_category TEXT;
  v_form_id TEXT;
BEGIN
  -- Buscar dados do lead com colunas CORRETAS
  -- IMPORTANTE: usar COALESCE para form_id pois lead_meta pode não existir ainda (race condition)
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
  v_current_day := EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Sao_Paulo')::INT;
  v_current_time := (NOW() AT TIME ZONE 'America/Sao_Paulo')::TIME;
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
    
    -- CORREÇÃO: Ignorar arrays vazios - source
    IF v_match ? 'source' AND jsonb_array_length(v_match->'source') > 0 THEN
      IF NOT (v_lead_source = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'source')))) THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- webhook_id usando source_webhook_id (coluna CORRETA)
    IF v_match ? 'webhook_id' AND jsonb_array_length(v_match->'webhook_id') > 0 THEN
      IF v_lead.source_webhook_id IS NULL OR NOT (v_lead.source_webhook_id::TEXT = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'webhook_id')))) THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- whatsapp_session_id usando source_session_id (coluna CORRETA)
    IF v_match ? 'whatsapp_session_id' AND jsonb_array_length(v_match->'whatsapp_session_id') > 0 THEN
      IF v_lead.source_session_id IS NULL OR NOT (v_lead.source_session_id::TEXT = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'whatsapp_session_id')))) THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- meta_form_id usando resolved_form_id (com fallback para leads.meta_form_id)
    IF v_match ? 'meta_form_id' AND jsonb_array_length(v_match->'meta_form_id') > 0 THEN
      IF v_form_id IS NULL OR NOT (v_form_id = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'meta_form_id')))) THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- website_category
    IF v_match ? 'website_category' AND jsonb_array_length(v_match->'website_category') > 0 THEN
      IF v_property_category IS NULL OR NOT (v_property_category = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'website_category')))) THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- campaign_name_contains
    IF v_match ? 'campaign_name_contains' AND v_match->>'campaign_name_contains' IS NOT NULL AND v_match->>'campaign_name_contains' != '' THEN
      IF v_lead.campaign_id IS NULL OR NOT (v_lead.campaign_id ILIKE '%' || (v_match->>'campaign_name_contains') || '%') THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- tag_in
    IF v_match ? 'tag_in' AND jsonb_array_length(v_match->'tag_in') > 0 THEN
      IF v_lead_tags IS NULL OR NOT (v_lead_tags && ARRAY(SELECT jsonb_array_elements_text(v_match->'tag_in'))) THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- city_in
    IF v_match ? 'city_in' AND jsonb_array_length(v_match->'city_in') > 0 THEN
      IF v_lead.city IS NULL OR NOT (v_lead.city = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'city_in')))) THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- interest_property_id
    IF v_match ? 'interest_property_id' AND v_match->>'interest_property_id' IS NOT NULL AND v_match->>'interest_property_id' != '' THEN
      IF v_lead.interest_property_id IS NULL OR v_lead.interest_property_id::TEXT != v_match->>'interest_property_id' THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- interest_plan_id
    IF v_match ? 'interest_plan_id' AND v_match->>'interest_plan_id' IS NOT NULL AND v_match->>'interest_plan_id' != '' THEN
      IF v_lead.interest_plan_id IS NULL OR v_lead.interest_plan_id::TEXT != v_match->>'interest_plan_id' THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- Schedule check
    v_schedule := v_rule.settings->'schedule';
    IF v_schedule IS NOT NULL AND jsonb_array_length(v_schedule) > 0 THEN
      DECLARE
        v_day_config JSONB;
        v_day_enabled BOOLEAN := FALSE;
      BEGIN
        FOR v_day_config IN SELECT * FROM jsonb_array_elements(v_schedule)
        LOOP
          IF (v_day_config->>'day')::INT = v_current_day 
             AND (v_day_config->>'enabled')::BOOLEAN = true THEN
            IF v_current_time >= (v_day_config->>'start')::TIME 
               AND v_current_time <= (v_day_config->>'end')::TIME THEN
              v_day_enabled := TRUE;
              EXIT;
            END IF;
          END IF;
        END LOOP;
        
        IF NOT v_day_enabled THEN
          CONTINUE;
        END IF;
      END;
    END IF;
    
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
