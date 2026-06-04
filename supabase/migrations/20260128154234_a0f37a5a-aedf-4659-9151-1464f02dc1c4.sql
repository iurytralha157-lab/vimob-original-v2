-- Corrigir função pick_round_robin_for_lead
-- Substituir prop.category por prop.tipo_de_negocio

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
BEGIN
  -- Buscar dados do lead
  -- CORRIGIDO: prop.tipo_de_negocio ao invés de prop.category
  SELECT l.*, p.default_round_robin_id, lm.campaign_id, lm.form_id,
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
      IF v_rule.match_type = 'webhook' AND v_lead.source_webhook_id::TEXT = v_rule.match_value THEN 
        RETURN v_rule.round_robin_id; 
      END IF;
      IF v_rule.match_type = 'whatsapp_session' AND v_lead.source_session_id::TEXT = v_rule.match_value THEN 
        RETURN v_rule.round_robin_id; 
      END IF;
      CONTINUE;
    END IF;
    
    -- Avaliar novo formato match JSONB
    IF v_match ? 'source' THEN
      IF NOT (v_lead_source = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'source')))) THEN
        CONTINUE;
      END IF;
    END IF;
    
    IF v_match ? 'webhook_id' THEN
      IF v_lead.source_webhook_id IS NULL OR NOT (
        v_lead.source_webhook_id::TEXT = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'webhook_id')))
      ) THEN
        CONTINUE;
      END IF;
    END IF;
    
    IF v_match ? 'whatsapp_session_id' THEN
      IF v_lead.source_session_id IS NULL OR NOT (
        v_lead.source_session_id::TEXT = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'whatsapp_session_id')))
      ) THEN
        CONTINUE;
      END IF;
    END IF;
    
    IF v_match ? 'meta_form_id' THEN
      IF v_lead.form_id IS NULL OR NOT (
        v_lead.form_id = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'meta_form_id')))
      ) THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- CORRIGIDO: Usar tipo_de_negocio para filtrar por categoria (Venda/Aluguel)
    IF v_match ? 'website_category' THEN
      IF v_property_category IS NULL OR NOT (
        v_property_category = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'website_category')))
      ) THEN
        CONTINUE;
      END IF;
    END IF;
    
    IF v_match ? 'campaign_name_contains' THEN
      IF v_lead.campaign_id IS NULL OR 
         NOT (v_lead.campaign_id ILIKE '%' || (v_match->>'campaign_name_contains') || '%') THEN
        CONTINUE;
      END IF;
    END IF;
    
    IF v_match ? 'tag_in' THEN
      IF v_lead_tags IS NULL OR NOT (
        SELECT bool_or(tag = ANY(v_lead_tags))
        FROM jsonb_array_elements_text(v_match->'tag_in') AS tag
      ) THEN
        CONTINUE;
      END IF;
    END IF;
    
    IF v_match ? 'city_in' THEN
      IF v_lead.city IS NULL OR NOT (
        v_lead.city = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'city_in')))
      ) THEN
        CONTINUE;
      END IF;
    END IF;
    
    IF v_match ? 'interest_property_id' THEN
      IF v_lead.interest_property_id IS NULL OR 
         v_lead.interest_property_id::TEXT != (v_match->>'interest_property_id') THEN
        CONTINUE;
      END IF;
    END IF;
    
    IF v_match ? 'interest_plan_id' THEN
      IF v_lead.interest_plan_id IS NULL OR 
         v_lead.interest_plan_id::TEXT != (v_match->>'interest_plan_id') THEN
        CONTINUE;
      END IF;
    END IF;
    
    IF v_match ? 'schedule' THEN
      v_schedule := v_match->'schedule';
      
      IF v_schedule ? 'days' THEN
        IF NOT (v_current_day = ANY(ARRAY(
          SELECT (jsonb_array_elements_text(v_schedule->'days'))::INT
        ))) THEN
          CONTINUE;
        END IF;
      END IF;
      
      IF v_schedule ? 'start' AND v_schedule ? 'end' THEN
        IF v_current_time < (v_schedule->>'start')::TIME OR 
           v_current_time > (v_schedule->>'end')::TIME THEN
          CONTINUE;
        END IF;
      END IF;
    END IF;
    
    RETURN v_rule.round_robin_id;
  END LOOP;
  
  IF v_lead.default_round_robin_id IS NOT NULL THEN 
    SELECT id INTO v_round_robin_id 
    FROM public.round_robins 
    WHERE id = v_lead.default_round_robin_id AND is_active = true; 
    IF FOUND THEN RETURN v_round_robin_id; END IF; 
  END IF;
  
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