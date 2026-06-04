-- Fix handle_lead_intake function with safe JSONB operations
-- Drop first because return type changed
DROP FUNCTION IF EXISTS public.handle_lead_intake(uuid);

CREATE OR REPLACE FUNCTION public.handle_lead_intake(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_lead leads%ROWTYPE;
  v_round_robin round_robins%ROWTYPE;
  v_assigned_user_id uuid;
  v_pipeline_id uuid;
  v_stage_id uuid;
  v_meta_form_id text;
  v_rule_matched boolean := false;
BEGIN
  -- Get the lead
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  
  IF v_lead IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Lead not found',
      'lead_id', p_lead_id
    );
  END IF;
  
  -- Extract meta_form_id from metadata if present
  v_meta_form_id := v_lead.metadata->>'form_id';
  
  -- Try to find a matching Round Robin based on rules
  -- Priority: meta_form_id > source > interest_property > catch-all
  
  -- 1. First try: Match by meta_form_id (most specific)
  IF v_meta_form_id IS NOT NULL THEN
    SELECT rr.* INTO v_round_robin
    FROM round_robins rr
    JOIN round_robin_rules rrr ON rrr.round_robin_id = rr.id AND rrr.is_active = true
    WHERE rr.organization_id = v_lead.organization_id
      AND rr.is_active = true
      AND rrr.match_type = 'meta_form_id'
      AND (
        -- Array check: {"meta_form_id": ["id1", "id2"]}
        (jsonb_typeof(rrr.match->'meta_form_id') = 'array' 
         AND rrr.match->'meta_form_id' ? v_meta_form_id)
        -- String check: {"meta_form_id": "id1"}
        OR rrr.match->>'meta_form_id' = v_meta_form_id
        -- Legacy field: match_value
        OR rrr.match_value = v_meta_form_id
      )
    ORDER BY rrr.priority ASC NULLS LAST
    LIMIT 1;
    
    IF v_round_robin.id IS NOT NULL THEN
      v_rule_matched := true;
    END IF;
  END IF;
  
  -- 2. Second try: Match by source
  IF v_round_robin.id IS NULL AND v_lead.source IS NOT NULL THEN
    SELECT rr.* INTO v_round_robin
    FROM round_robins rr
    JOIN round_robin_rules rrr ON rrr.round_robin_id = rr.id AND rrr.is_active = true
    WHERE rr.organization_id = v_lead.organization_id
      AND rr.is_active = true
      AND rrr.match_type = 'source'
      AND (
        -- Array check: {"source": ["meta", "whatsapp"]}
        (jsonb_typeof(rrr.match->'source') = 'array' 
         AND rrr.match->'source' ? v_lead.source)
        -- String check: {"source": "meta"}
        OR rrr.match->>'source' = v_lead.source
        -- Legacy field: match_value
        OR rrr.match_value = v_lead.source
      )
    ORDER BY rrr.priority ASC NULLS LAST
    LIMIT 1;
    
    IF v_round_robin.id IS NOT NULL THEN
      v_rule_matched := true;
    END IF;
  END IF;
  
  -- 3. Third try: Match by interest_property
  IF v_round_robin.id IS NULL AND v_lead.interest_property_id IS NOT NULL THEN
    SELECT rr.* INTO v_round_robin
    FROM round_robins rr
    JOIN round_robin_rules rrr ON rrr.round_robin_id = rr.id AND rrr.is_active = true
    WHERE rr.organization_id = v_lead.organization_id
      AND rr.is_active = true
      AND rrr.match_type = 'interest_property'
      AND (
        rrr.match->>'interest_property_id' = v_lead.interest_property_id::text
        OR rrr.match_value = v_lead.interest_property_id::text
      )
    ORDER BY rrr.priority ASC NULLS LAST
    LIMIT 1;
    
    IF v_round_robin.id IS NOT NULL THEN
      v_rule_matched := true;
    END IF;
  END IF;
  
  -- 4. Fallback: Find a Round Robin without any active rules (catch-all)
  IF v_round_robin.id IS NULL THEN
    SELECT rr.* INTO v_round_robin
    FROM round_robins rr
    WHERE rr.organization_id = v_lead.organization_id
      AND rr.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM round_robin_rules rrr 
        WHERE rrr.round_robin_id = rr.id AND rrr.is_active = true
      )
    LIMIT 1;
  END IF;
  
  -- If no Round Robin found, lead stays in pool
  IF v_round_robin.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'lead_id', p_lead_id,
      'pipeline_id', v_lead.pipeline_id,
      'stage_id', v_lead.stage_id,
      'assigned_user_id', null,
      'round_robin_used', false,
      'message', 'No matching round robin found, lead stays in pool'
    );
  END IF;
  
  -- Get next user from round robin
  v_assigned_user_id := get_next_round_robin_user(v_round_robin.id);
  
  -- Use pipeline/stage from round robin if defined, otherwise keep lead's current
  v_pipeline_id := COALESCE(v_round_robin.pipeline_id, v_lead.pipeline_id);
  v_stage_id := COALESCE(v_round_robin.stage_id, v_lead.stage_id);
  
  -- Update lead with assignment
  UPDATE leads
  SET 
    assigned_user_id = v_assigned_user_id,
    pipeline_id = v_pipeline_id,
    stage_id = v_stage_id,
    updated_at = now()
  WHERE id = p_lead_id;
  
  -- Log the assignment
  INSERT INTO assignments_log (
    lead_id,
    assigned_user_id,
    round_robin_id,
    organization_id,
    reason,
    assigned_at
  ) VALUES (
    p_lead_id,
    v_assigned_user_id,
    v_round_robin.id,
    v_lead.organization_id,
    CASE WHEN v_rule_matched THEN 'rule_match' ELSE 'catch_all' END,
    now()
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'pipeline_id', v_pipeline_id,
    'stage_id', v_stage_id,
    'assigned_user_id', v_assigned_user_id,
    'round_robin_used', true,
    'round_robin_id', v_round_robin.id
  );
END;
$function$;