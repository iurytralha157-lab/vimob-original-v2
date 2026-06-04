-- Drop existing function to allow signature change
DROP FUNCTION IF EXISTS public.handle_lead_intake(uuid);

-- Recreate with corrected logic using round_robin_rules
CREATE OR REPLACE FUNCTION public.handle_lead_intake(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_round_robin RECORD;
  v_member RECORD;
  v_next_index integer;
  v_member_count integer;
  v_source_label text;
  v_event_metadata jsonb;
  v_meta_form_id text;
BEGIN
  -- Get lead data
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  
  IF v_lead IS NULL THEN
    RAISE EXCEPTION 'Lead not found: %', p_lead_id;
  END IF;
  
  -- Get meta_form_id from lead_meta if exists
  SELECT lm.form_id INTO v_meta_form_id
  FROM lead_meta lm
  WHERE lm.lead_id = p_lead_id;
  
  -- Build source label and metadata for timeline
  v_source_label := COALESCE(v_lead.source, 'manual');
  v_event_metadata := jsonb_build_object(
    'source', v_lead.source,
    'meta_form_id', v_meta_form_id
  );
  
  -- Log lead creation in timeline
  INSERT INTO lead_timeline_events (
    organization_id, lead_id, event_type, user_id, title, metadata
  )
  VALUES (
    v_lead.organization_id,
    p_lead_id,
    'lead_created',
    NULL,
    'Lead criado via ' || v_source_label,
    v_event_metadata
  );
  
  -- Find matching Round Robin using rules
  -- Priority: 1) meta_form_id match, 2) source match, 3) catch-all (no rules)
  
  -- First try: specific meta_form_id match
  IF v_meta_form_id IS NOT NULL THEN
    SELECT rr.* INTO v_round_robin
    FROM round_robins rr
    JOIN round_robin_rules rrr ON rrr.round_robin_id = rr.id AND rrr.is_active = true
    WHERE rr.organization_id = v_lead.organization_id
      AND rr.is_active = true
      AND rrr.match_type = 'meta_form_id'
      AND (
        rrr.match->'meta_form_id' ? v_meta_form_id
        OR rrr.match_value = v_meta_form_id
      )
    ORDER BY rr.created_at
    LIMIT 1;
  END IF;
  
  -- Second try: source match
  IF v_round_robin IS NULL AND v_lead.source IS NOT NULL THEN
    SELECT rr.* INTO v_round_robin
    FROM round_robins rr
    JOIN round_robin_rules rrr ON rrr.round_robin_id = rr.id AND rrr.is_active = true
    WHERE rr.organization_id = v_lead.organization_id
      AND rr.is_active = true
      AND rrr.match_type = 'source'
      AND (
        rrr.match->'source' ? v_lead.source
        OR rrr.match_value = v_lead.source
      )
    ORDER BY rr.created_at
    LIMIT 1;
  END IF;
  
  -- Third try: interest_property match
  IF v_round_robin IS NULL AND v_lead.interest_property_id IS NOT NULL THEN
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
    ORDER BY rr.created_at
    LIMIT 1;
  END IF;
  
  -- Fallback: Round Robin without any rules (catch-all)
  IF v_round_robin IS NULL THEN
    SELECT rr.* INTO v_round_robin
    FROM round_robins rr
    WHERE rr.organization_id = v_lead.organization_id
      AND rr.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM round_robin_rules rrr 
        WHERE rrr.round_robin_id = rr.id AND rrr.is_active = true
      )
    ORDER BY rr.created_at
    LIMIT 1;
  END IF;
  
  -- No Round Robin found - leave lead unassigned
  IF v_round_robin IS NULL THEN
    -- Set pipeline/stage from first active pipeline if not set
    IF v_lead.pipeline_id IS NULL THEN
      UPDATE leads l
      SET pipeline_id = (
        SELECT p.id FROM pipelines p 
        WHERE p.organization_id = v_lead.organization_id 
        ORDER BY p.created_at LIMIT 1
      ),
      stage_id = (
        SELECT s.id FROM stages s 
        JOIN pipelines p ON s.pipeline_id = p.id
        WHERE p.organization_id = v_lead.organization_id 
        ORDER BY p.created_at, s.position LIMIT 1
      )
      WHERE l.id = p_lead_id;
    END IF;
    RETURN;
  END IF;
  
  -- Count active members in this Round Robin
  SELECT COUNT(*) INTO v_member_count
  FROM round_robin_members
  WHERE round_robin_id = v_round_robin.id;
  
  IF v_member_count = 0 THEN
    -- No members, leave unassigned but set pipeline/stage if configured
    IF v_round_robin.target_pipeline_id IS NOT NULL THEN
      UPDATE leads SET 
        pipeline_id = v_round_robin.target_pipeline_id,
        stage_id = COALESCE(v_round_robin.target_stage_id, (
          SELECT id FROM stages 
          WHERE pipeline_id = v_round_robin.target_pipeline_id 
          ORDER BY position LIMIT 1
        ))
      WHERE id = p_lead_id;
    END IF;
    RETURN;
  END IF;
  
  -- Calculate next index (simple round robin)
  v_next_index := COALESCE(v_round_robin.last_assigned_index, -1) + 1;
  IF v_next_index >= v_member_count THEN
    v_next_index := 0;
  END IF;
  
  -- Get the member at this position
  SELECT * INTO v_member
  FROM round_robin_members
  WHERE round_robin_id = v_round_robin.id
  ORDER BY position
  OFFSET v_next_index
  LIMIT 1;
  
  IF v_member IS NULL THEN
    -- Fallback to first member
    SELECT * INTO v_member
    FROM round_robin_members
    WHERE round_robin_id = v_round_robin.id
    ORDER BY position
    LIMIT 1;
    v_next_index := 0;
  END IF;
  
  -- Update lead with assignment
  UPDATE leads SET
    assigned_user_id = v_member.user_id,
    pipeline_id = COALESCE(v_round_robin.target_pipeline_id, pipeline_id, (
      SELECT id FROM pipelines WHERE organization_id = v_lead.organization_id ORDER BY created_at LIMIT 1
    )),
    stage_id = COALESCE(v_round_robin.target_stage_id, stage_id, (
      SELECT s.id FROM stages s 
      JOIN pipelines p ON s.pipeline_id = p.id
      WHERE p.organization_id = v_lead.organization_id 
      ORDER BY p.created_at, s.position LIMIT 1
    ))
  WHERE id = p_lead_id;
  
  -- Update round robin index
  UPDATE round_robins 
  SET last_assigned_index = v_next_index
  WHERE id = v_round_robin.id;
  
  -- Log assignment
  INSERT INTO assignments_log (
    lead_id, organization_id, round_robin_id, assigned_user_id, reason
  )
  VALUES (
    p_lead_id,
    v_lead.organization_id,
    v_round_robin.id,
    v_member.user_id,
    'round_robin_auto'
  );
  
  -- Log in timeline
  INSERT INTO lead_timeline_events (
    organization_id, lead_id, event_type, user_id, title, metadata
  )
  VALUES (
    v_lead.organization_id,
    p_lead_id,
    'assignment',
    NULL,
    'Lead atribuído automaticamente',
    jsonb_build_object(
      'round_robin_id', v_round_robin.id,
      'round_robin_name', v_round_robin.name,
      'assigned_user_id', v_member.user_id
    )
  );
  
END;
$$;