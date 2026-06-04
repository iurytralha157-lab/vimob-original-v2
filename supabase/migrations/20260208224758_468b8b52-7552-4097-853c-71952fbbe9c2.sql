-- Corrigir função pick_round_robin_for_lead para ignorar arrays vazios
CREATE OR REPLACE FUNCTION public.pick_round_robin_for_lead(p_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_rule RECORD;
  v_match JSONB;
  v_lead_source TEXT;
  v_lead_webhook_id UUID;
  v_lead_whatsapp_session_id UUID;
  v_lead_meta_form_id TEXT;
  v_lead_website_category TEXT;
  v_lead_tags TEXT[];
  v_lead_city TEXT;
  v_matched BOOLEAN;
BEGIN
  -- Buscar dados do lead
  SELECT 
    l.id,
    l.organization_id,
    l.source,
    l.webhook_id,
    l.whatsapp_session_id,
    l.website_category,
    l.city,
    lm.form_id as meta_form_id,
    ARRAY(SELECT lt.tag_id::text FROM lead_tags lt WHERE lt.lead_id = l.id) as tags
  INTO v_lead
  FROM leads l
  LEFT JOIN lead_meta lm ON lm.lead_id = l.id
  WHERE l.id = p_lead_id;

  IF v_lead IS NULL THEN
    RETURN NULL;
  END IF;

  v_lead_source := v_lead.source;
  v_lead_webhook_id := v_lead.webhook_id;
  v_lead_whatsapp_session_id := v_lead.whatsapp_session_id;
  v_lead_meta_form_id := v_lead.meta_form_id;
  v_lead_website_category := v_lead.website_category;
  v_lead_tags := v_lead.tags;
  v_lead_city := v_lead.city;

  -- Iterar sobre regras ordenadas por prioridade (maior prioridade primeiro)
  FOR v_rule IN 
    SELECT rr.id as round_robin_id, rrr.match, rrr.priority
    FROM round_robin_rules rrr
    JOIN round_robins rr ON rr.id = rrr.round_robin_id
    WHERE rr.organization_id = v_lead.organization_id
      AND rr.is_active = true
      AND rrr.is_active = true
    ORDER BY rrr.priority DESC
  LOOP
    v_match := v_rule.match;
    v_matched := true;

    -- Verificar source (IGNORAR se array vazio)
    IF v_match ? 'source' AND jsonb_typeof(v_match->'source') = 'array' AND jsonb_array_length(v_match->'source') > 0 THEN
      IF NOT (v_lead_source = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'source')))) THEN
        v_matched := false;
      END IF;
    END IF;

    -- Verificar webhook_id (IGNORAR se array vazio)
    IF v_matched AND v_match ? 'webhook_id' AND jsonb_typeof(v_match->'webhook_id') = 'array' AND jsonb_array_length(v_match->'webhook_id') > 0 THEN
      IF v_lead_webhook_id IS NULL OR NOT (v_lead_webhook_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'webhook_id')))) THEN
        v_matched := false;
      END IF;
    END IF;

    -- Verificar whatsapp_session_id (IGNORAR se array vazio)
    IF v_matched AND v_match ? 'whatsapp_session_id' AND jsonb_typeof(v_match->'whatsapp_session_id') = 'array' AND jsonb_array_length(v_match->'whatsapp_session_id') > 0 THEN
      IF v_lead_whatsapp_session_id IS NULL OR NOT (v_lead_whatsapp_session_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'whatsapp_session_id')))) THEN
        v_matched := false;
      END IF;
    END IF;

    -- Verificar meta_form_id (IGNORAR se array vazio)
    IF v_matched AND v_match ? 'meta_form_id' AND jsonb_typeof(v_match->'meta_form_id') = 'array' AND jsonb_array_length(v_match->'meta_form_id') > 0 THEN
      IF v_lead_meta_form_id IS NULL OR NOT (v_lead_meta_form_id = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'meta_form_id')))) THEN
        v_matched := false;
      END IF;
    END IF;

    -- Verificar website_category (IGNORAR se array vazio)
    IF v_matched AND v_match ? 'website_category' AND jsonb_typeof(v_match->'website_category') = 'array' AND jsonb_array_length(v_match->'website_category') > 0 THEN
      IF v_lead_website_category IS NULL OR NOT (v_lead_website_category = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'website_category')))) THEN
        v_matched := false;
      END IF;
    END IF;

    -- Verificar campaign_name_contains (string, não array)
    IF v_matched AND v_match ? 'campaign_name_contains' THEN
      DECLARE
        v_campaign_name TEXT;
        v_pattern TEXT;
      BEGIN
        SELECT lm.campaign_name INTO v_campaign_name FROM lead_meta lm WHERE lm.lead_id = p_lead_id;
        v_pattern := v_match->>'campaign_name_contains';
        IF v_campaign_name IS NULL OR v_campaign_name NOT ILIKE '%' || v_pattern || '%' THEN
          v_matched := false;
        END IF;
      END;
    END IF;

    -- Verificar tag_in (IGNORAR se array vazio)
    IF v_matched AND v_match ? 'tag_in' AND jsonb_typeof(v_match->'tag_in') = 'array' AND jsonb_array_length(v_match->'tag_in') > 0 THEN
      IF v_lead_tags IS NULL OR NOT (v_lead_tags && ARRAY(SELECT jsonb_array_elements_text(v_match->'tag_in'))) THEN
        v_matched := false;
      END IF;
    END IF;

    -- Verificar city_in (IGNORAR se array vazio)
    IF v_matched AND v_match ? 'city_in' AND jsonb_typeof(v_match->'city_in') = 'array' AND jsonb_array_length(v_match->'city_in') > 0 THEN
      IF v_lead_city IS NULL OR NOT (v_lead_city = ANY(ARRAY(SELECT jsonb_array_elements_text(v_match->'city_in')))) THEN
        v_matched := false;
      END IF;
    END IF;

    -- Verificar interest_property_id (string, não array)
    IF v_matched AND v_match ? 'interest_property_id' THEN
      DECLARE
        v_interest_property_id UUID;
        v_required_property TEXT;
      BEGIN
        SELECT l.interest_property_id INTO v_interest_property_id FROM leads l WHERE l.id = p_lead_id;
        v_required_property := v_match->>'interest_property_id';
        IF v_interest_property_id IS NULL OR v_interest_property_id::text != v_required_property THEN
          v_matched := false;
        END IF;
      END;
    END IF;

    -- Verificar interest_plan_id (string, não array)
    IF v_matched AND v_match ? 'interest_plan_id' THEN
      DECLARE
        v_interest_plan_id UUID;
        v_required_plan TEXT;
      BEGIN
        SELECT l.interest_plan_id INTO v_interest_plan_id FROM leads l WHERE l.id = p_lead_id;
        v_required_plan := v_match->>'interest_plan_id';
        IF v_interest_plan_id IS NULL OR v_interest_plan_id::text != v_required_plan THEN
          v_matched := false;
        END IF;
      END;
    END IF;

    -- Se todas as condições foram atendidas, retornar esta fila
    IF v_matched THEN
      RETURN v_rule.round_robin_id;
    END IF;
  END LOOP;

  -- Nenhuma regra correspondeu
  RETURN NULL;
END;
$$;