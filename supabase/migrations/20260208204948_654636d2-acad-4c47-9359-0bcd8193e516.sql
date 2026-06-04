-- Fix handle_lead_intake: use correct column meta_form_id instead of non-existent metadata field
CREATE OR REPLACE FUNCTION public.handle_lead_intake(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_round_robin RECORD;
  v_rule RECORD;
  v_assigned_user_id uuid;
  v_pipeline_id uuid;
  v_stage_id uuid;
  v_result jsonb;
  v_meta_form_id text;
  v_matched_rule_id uuid := NULL;
  v_matched_priority int := 999999;
BEGIN
  -- Get the lead data
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  
  IF v_lead IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead not found');
  END IF;

  -- Get meta_form_id directly from the leads table column (NOT from metadata)
  v_meta_form_id := v_lead.meta_form_id;

  -- Find matching round robin with rules, ordered by priority
  FOR v_rule IN
    SELECT 
      rrr.id as rule_id,
      rrr.round_robin_id,
      rrr.priority,
      rrr.match,
      rrr.match_type,
      rrr.match_value,
      rr.pipeline_id,
      rr.stage_id,
      rr.is_active as rr_active
    FROM round_robin_rules rrr
    JOIN round_robins rr ON rr.id = rrr.round_robin_id
    WHERE rr.organization_id = v_lead.organization_id
      AND rr.is_active = true
      AND rrr.is_active = true
    ORDER BY rrr.priority ASC, rrr.created_at ASC
  LOOP
    -- Check match conditions based on match_type
    IF v_rule.match_type = 'meta_form' THEN
      -- Match by Meta form ID (highest priority for Meta leads)
      IF v_meta_form_id IS NOT NULL THEN
        IF (v_rule.match IS NOT NULL AND jsonb_typeof(v_rule.match->'meta_form_ids') = 'array' AND v_rule.match->'meta_form_ids' ? v_meta_form_id)
           OR v_rule.match_value = v_meta_form_id THEN
          v_matched_rule_id := v_rule.rule_id;
          v_pipeline_id := v_rule.pipeline_id;
          v_stage_id := v_rule.stage_id;
          EXIT;
        END IF;
      END IF;
    ELSIF v_rule.match_type = 'source' THEN
      -- Match by source
      IF v_lead.source IS NOT NULL THEN
        IF (v_rule.match IS NOT NULL AND jsonb_typeof(v_rule.match->'source') = 'array' AND v_rule.match->'source' ? v_lead.source)
           OR (v_rule.match IS NOT NULL AND v_rule.match->>'source' = v_lead.source)
           OR v_rule.match_value = v_lead.source THEN
          v_matched_rule_id := v_rule.rule_id;
          v_pipeline_id := v_rule.pipeline_id;
          v_stage_id := v_rule.stage_id;
          EXIT;
        END IF;
      END IF;
    ELSIF v_rule.match_type = 'property' THEN
      -- Match by interest property
      IF v_lead.interest_property_id IS NOT NULL THEN
        IF v_rule.match_value = v_lead.interest_property_id::text THEN
          v_matched_rule_id := v_rule.rule_id;
          v_pipeline_id := v_rule.pipeline_id;
          v_stage_id := v_rule.stage_id;
          EXIT;
        END IF;
      END IF;
    ELSIF v_rule.match_type = 'catch_all' OR v_rule.match_type IS NULL THEN
      -- Catch-all rule (lowest priority)
      IF v_matched_rule_id IS NULL THEN
        v_matched_rule_id := v_rule.rule_id;
        v_pipeline_id := v_rule.pipeline_id;
        v_stage_id := v_rule.stage_id;
        -- Don't exit, keep looking for more specific matches
      END IF;
    END IF;
  END LOOP;

  -- If no rule matched, try to find a default round robin for the organization
  IF v_matched_rule_id IS NULL THEN
    SELECT rr.id, rr.pipeline_id, rr.stage_id
    INTO v_round_robin
    FROM round_robins rr
    WHERE rr.organization_id = v_lead.organization_id
      AND rr.is_active = true
    ORDER BY rr.created_at ASC
    LIMIT 1;
    
    IF v_round_robin IS NOT NULL THEN
      v_pipeline_id := v_round_robin.pipeline_id;
      v_stage_id := v_round_robin.stage_id;
    END IF;
  END IF;

  -- Get next user from round robin if we have a matched rule
  IF v_matched_rule_id IS NOT NULL THEN
    SELECT rrr.round_robin_id INTO v_round_robin 
    FROM round_robin_rules rrr 
    WHERE rrr.id = v_matched_rule_id;
    
    -- Get next available member from the queue
    SELECT rrm.user_id INTO v_assigned_user_id
    FROM round_robin_members rrm
    WHERE rrm.round_robin_id = v_round_robin.round_robin_id
      AND rrm.is_active = true
      AND rrm.is_available = true
    ORDER BY rrm.last_assigned_at ASC NULLS FIRST, rrm.created_at ASC
    LIMIT 1;
    
    -- Update last assigned timestamp
    IF v_assigned_user_id IS NOT NULL THEN
      UPDATE round_robin_members
      SET last_assigned_at = NOW()
      WHERE round_robin_id = v_round_robin.round_robin_id
        AND user_id = v_assigned_user_id;
    END IF;
  END IF;

  -- Update lead with pipeline, stage, and assigned user
  UPDATE leads
  SET 
    pipeline_id = COALESCE(v_pipeline_id, pipeline_id),
    stage_id = COALESCE(v_stage_id, stage_id),
    assigned_user_id = COALESCE(v_assigned_user_id, assigned_user_id),
    updated_at = NOW()
  WHERE id = p_lead_id;

  -- Log the assignment
  IF v_assigned_user_id IS NOT NULL THEN
    INSERT INTO assignments_log (
      lead_id,
      assigned_user_id,
      round_robin_id,
      organization_id,
      reason
    ) VALUES (
      p_lead_id,
      v_assigned_user_id,
      v_round_robin.round_robin_id,
      v_lead.organization_id,
      CASE 
        WHEN v_matched_rule_id IS NOT NULL THEN 'round_robin_rule'
        ELSE 'default_round_robin'
      END
    );
  END IF;

  -- Create lead_created activity
  INSERT INTO activities (lead_id, type, content, user_id)
  VALUES (p_lead_id, 'lead_created', 'Lead criado', v_assigned_user_id);

  -- Create timeline event
  INSERT INTO lead_timeline (lead_id, event_type, description, metadata)
  VALUES (
    p_lead_id,
    'created',
    'Lead criado via ' || COALESCE(v_lead.source, 'manual'),
    jsonb_build_object(
      'source', v_lead.source,
      'assigned_user_id', v_assigned_user_id,
      'pipeline_id', v_pipeline_id,
      'stage_id', v_stage_id,
      'matched_rule_id', v_matched_rule_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'assigned_user_id', v_assigned_user_id,
    'pipeline_id', v_pipeline_id,
    'stage_id', v_stage_id,
    'matched_rule_id', v_matched_rule_id
  );
END;
$$;