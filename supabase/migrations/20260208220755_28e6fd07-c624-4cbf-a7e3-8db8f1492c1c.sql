-- Fix handle_lead_intake: use correct columns from round_robin_members
-- Uses leads_count and position for ordering (not last_assigned_at which doesn't exist)
CREATE OR REPLACE FUNCTION public.handle_lead_intake(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_org_id uuid;
  v_queue RECORD;
  v_next_user_id uuid;
  v_matched boolean := false;
  v_meta_form_id text;
BEGIN
  -- Fetch the lead
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead not found');
  END IF;
  
  v_org_id := v_lead.organization_id;
  v_meta_form_id := v_lead.meta_form_id;
  
  -- Priority 1: Meta Form ID match
  IF v_meta_form_id IS NOT NULL THEN
    SELECT rr.* INTO v_queue
    FROM round_robins rr
    JOIN round_robin_rules rrr ON rrr.round_robin_id = rr.id
    WHERE rr.organization_id = v_org_id
      AND rr.is_active = true
      AND (rrr.is_active IS NULL OR rrr.is_active = true)
      AND rrr.match_type = 'meta_form'
      AND rrr.match_value = v_meta_form_id
    LIMIT 1;
    
    IF FOUND THEN
      v_matched := true;
    END IF;
  END IF;
  
  -- Priority 2: Source match
  IF NOT v_matched AND v_lead.source IS NOT NULL THEN
    SELECT rr.* INTO v_queue
    FROM round_robins rr
    JOIN round_robin_rules rrr ON rrr.round_robin_id = rr.id
    WHERE rr.organization_id = v_org_id
      AND rr.is_active = true
      AND (rrr.is_active IS NULL OR rrr.is_active = true)
      AND rrr.match_type = 'source'
      AND rrr.match_value = v_lead.source
    LIMIT 1;
    
    IF FOUND THEN
      v_matched := true;
    END IF;
  END IF;
  
  -- Priority 3: Interest property match
  IF NOT v_matched AND v_lead.interest_property_id IS NOT NULL THEN
    SELECT rr.* INTO v_queue
    FROM round_robins rr
    JOIN round_robin_rules rrr ON rrr.round_robin_id = rr.id
    WHERE rr.organization_id = v_org_id
      AND rr.is_active = true
      AND (rrr.is_active IS NULL OR rrr.is_active = true)
      AND rrr.match_type = 'interest_property'
      AND rrr.match_value = v_lead.interest_property_id::text
    LIMIT 1;
    
    IF FOUND THEN
      v_matched := true;
    END IF;
  END IF;
  
  -- Priority 4: Catch-all (queue with no active rules)
  IF NOT v_matched THEN
    SELECT rr.* INTO v_queue
    FROM round_robins rr
    WHERE rr.organization_id = v_org_id
      AND rr.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM round_robin_rules rrr 
        WHERE rrr.round_robin_id = rr.id 
        AND (rrr.is_active IS NULL OR rrr.is_active = true)
      )
    LIMIT 1;
    
    IF FOUND THEN
      v_matched := true;
    END IF;
  END IF;
  
  -- If no queue matched, return without distribution
  IF NOT v_matched OR v_queue IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'lead_id', p_lead_id,
      'pipeline_id', null,
      'stage_id', null,
      'assigned_user_id', null,
      'round_robin_used', false,
      'message', 'No matching round robin queue found'
    );
  END IF;
  
  -- Check if queue has valid target pipeline and stage
  IF v_queue.target_pipeline_id IS NULL OR v_queue.target_stage_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'lead_id', p_lead_id,
      'round_robin_id', v_queue.id,
      'round_robin_name', v_queue.name,
      'error', 'Round robin queue missing target pipeline or stage configuration'
    );
  END IF;
  
  -- Get next user using round robin logic (by position and leads_count)
  SELECT rrm.user_id INTO v_next_user_id
  FROM round_robin_members rrm
  JOIN users u ON u.id = rrm.user_id
  WHERE rrm.round_robin_id = v_queue.id
    AND u.is_active = true
  ORDER BY rrm.leads_count ASC NULLS FIRST, rrm.position ASC
  LIMIT 1;
  
  -- Update lead with distribution info
  UPDATE leads
  SET 
    pipeline_id = v_queue.target_pipeline_id,
    stage_id = v_queue.target_stage_id,
    assigned_user_id = v_next_user_id,
    stage_entered_at = now(),
    updated_at = now()
  WHERE id = p_lead_id;
  
  -- Update member's leads counter
  IF v_next_user_id IS NOT NULL THEN
    UPDATE round_robin_members
    SET leads_count = COALESCE(leads_count, 0) + 1
    WHERE round_robin_id = v_queue.id AND user_id = v_next_user_id;
    
    -- Log the assignment
    INSERT INTO assignments_log (lead_id, assigned_user_id, round_robin_id, organization_id, reason)
    VALUES (p_lead_id, v_next_user_id, v_queue.id, v_org_id, 'round_robin_auto');
  END IF;
  
  -- Create timeline event for lead creation
  INSERT INTO lead_timeline (lead_id, event_type, event_data, created_by)
  VALUES (
    p_lead_id,
    'lead_created',
    jsonb_build_object(
      'source', v_lead.source,
      'pipeline_id', v_queue.target_pipeline_id,
      'stage_id', v_queue.target_stage_id,
      'assigned_user_id', v_next_user_id,
      'round_robin_id', v_queue.id
    ),
    v_next_user_id
  );
  
  -- Create activity for lead creation
  INSERT INTO activities (lead_id, type, content, user_id)
  VALUES (
    p_lead_id,
    'lead_created',
    'Lead criado e distribuído automaticamente',
    v_next_user_id
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'pipeline_id', v_queue.target_pipeline_id,
    'stage_id', v_queue.target_stage_id,
    'assigned_user_id', v_next_user_id,
    'round_robin_used', true,
    'round_robin_id', v_queue.id,
    'round_robin_name', v_queue.name
  );
END;
$$;