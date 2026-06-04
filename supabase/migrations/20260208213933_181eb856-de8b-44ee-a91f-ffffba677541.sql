-- Fix handle_lead_intake function: use correct column names from round_robins table
-- Columns are target_pipeline_id and target_stage_id, not pipeline_id and stage_id

CREATE OR REPLACE FUNCTION public.handle_lead_intake(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_queue RECORD;
  v_rule RECORD;
  v_next_user_id uuid;
  v_result jsonb;
  v_matched_queue_id uuid;
  v_match_reason text;
  v_meta_form_id text;
  v_source text;
  v_property_id uuid;
BEGIN
  -- Get lead data
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  
  IF v_lead IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead not found');
  END IF;
  
  -- Extract meta_form_id directly from the column (not from metadata)
  v_meta_form_id := v_lead.meta_form_id;
  v_source := v_lead.source;
  v_property_id := v_lead.interest_property_id;
  
  -- Find matching queue by priority: meta_form > source > property > catch-all
  -- Priority 1: Match by meta_form_id
  IF v_meta_form_id IS NOT NULL THEN
    SELECT rr.id, rr.target_pipeline_id, rr.target_stage_id, 'meta_form' as match_type
    INTO v_queue
    FROM round_robins rr
    JOIN round_robin_rules rrr ON rrr.round_robin_id = rr.id
    WHERE rr.organization_id = v_lead.organization_id
      AND rr.is_active = true
      AND rrr.is_active = true
      AND rrr.match_type = 'meta_form'
      AND rrr.match_value = v_meta_form_id
    ORDER BY rr.created_at
    LIMIT 1;
    
    IF v_queue IS NOT NULL THEN
      v_matched_queue_id := v_queue.id;
      v_match_reason := 'meta_form:' || v_meta_form_id;
    END IF;
  END IF;
  
  -- Priority 2: Match by source
  IF v_matched_queue_id IS NULL AND v_source IS NOT NULL THEN
    SELECT rr.id, rr.target_pipeline_id, rr.target_stage_id, 'source' as match_type
    INTO v_queue
    FROM round_robins rr
    JOIN round_robin_rules rrr ON rrr.round_robin_id = rr.id
    WHERE rr.organization_id = v_lead.organization_id
      AND rr.is_active = true
      AND rrr.is_active = true
      AND rrr.match_type = 'source'
      AND rrr.match_value = v_source
    ORDER BY rr.created_at
    LIMIT 1;
    
    IF v_queue IS NOT NULL THEN
      v_matched_queue_id := v_queue.id;
      v_match_reason := 'source:' || v_source;
    END IF;
  END IF;
  
  -- Priority 3: Match by property
  IF v_matched_queue_id IS NULL AND v_property_id IS NOT NULL THEN
    SELECT rr.id, rr.target_pipeline_id, rr.target_stage_id, 'property' as match_type
    INTO v_queue
    FROM round_robins rr
    JOIN round_robin_rules rrr ON rrr.round_robin_id = rr.id
    WHERE rr.organization_id = v_lead.organization_id
      AND rr.is_active = true
      AND rrr.is_active = true
      AND rrr.match_type = 'property'
      AND rrr.match_value = v_property_id::text
    ORDER BY rr.created_at
    LIMIT 1;
    
    IF v_queue IS NOT NULL THEN
      v_matched_queue_id := v_queue.id;
      v_match_reason := 'property:' || v_property_id::text;
    END IF;
  END IF;
  
  -- Priority 4: Catch-all (queues without active rules)
  IF v_matched_queue_id IS NULL THEN
    SELECT rr.id, rr.target_pipeline_id, rr.target_stage_id, 'catch_all' as match_type
    INTO v_queue
    FROM round_robins rr
    WHERE rr.organization_id = v_lead.organization_id
      AND rr.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM round_robin_rules rrr 
        WHERE rrr.round_robin_id = rr.id AND rrr.is_active = true
      )
    ORDER BY rr.created_at
    LIMIT 1;
    
    IF v_queue IS NOT NULL THEN
      v_matched_queue_id := v_queue.id;
      v_match_reason := 'catch_all';
    END IF;
  END IF;
  
  -- If no queue found, leave lead in pool
  IF v_matched_queue_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true, 
      'distributed', false, 
      'reason', 'No matching queue found - lead stays in pool'
    );
  END IF;
  
  -- Get next user from queue using round robin
  SELECT assign_lead_round_robin(v_matched_queue_id, p_lead_id) INTO v_next_user_id;
  
  -- Update lead with pipeline, stage and assigned user
  UPDATE leads SET
    pipeline_id = v_queue.target_pipeline_id,
    stage_id = v_queue.target_stage_id,
    assigned_user_id = v_next_user_id,
    stage_entered_at = now(),
    updated_at = now()
  WHERE id = p_lead_id;
  
  -- Create lead_created activity
  INSERT INTO activities (lead_id, type, content, user_id)
  VALUES (p_lead_id, 'lead_created', 'Lead criado e distribuído automaticamente', v_next_user_id);
  
  -- Create timeline event
  INSERT INTO lead_timeline (lead_id, event_type, description, created_by)
  VALUES (p_lead_id, 'created', 'Lead criado via ' || COALESCE(v_source, 'sistema'), v_next_user_id);
  
  RETURN jsonb_build_object(
    'success', true,
    'distributed', true,
    'queue_id', v_matched_queue_id,
    'match_reason', v_match_reason,
    'assigned_user_id', v_next_user_id,
    'pipeline_id', v_queue.target_pipeline_id,
    'stage_id', v_queue.target_stage_id
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'detail', SQLSTATE
  );
END;
$$;