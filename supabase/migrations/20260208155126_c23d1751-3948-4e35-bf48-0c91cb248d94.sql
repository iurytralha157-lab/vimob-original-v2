-- Remove fallback automático: se não houver regra de distribuição, lead fica no pool
CREATE OR REPLACE FUNCTION public.handle_lead_intake(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead RECORD;
  v_queue RECORD;
  v_member RECORD;
  v_assigned_user_id uuid;
  v_next_index int;
  v_member_count int;
  v_attempts int := 0;
  v_max_attempts int := 100;
  v_round_robin_id uuid;
  v_target_pipeline_id uuid;
  v_target_stage_id uuid;
  v_user_name text;
  v_is_redistribution boolean := false;
BEGIN
  -- 1. Get lead data
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead not found');
  END IF;
  
  -- Check if this is a redistribution (lead had previous activity)
  SELECT EXISTS (
    SELECT 1 FROM activities 
    WHERE lead_id = p_lead_id 
    AND type = 'assignee_changed'
    LIMIT 1
  ) INTO v_is_redistribution;
  
  IF v_lead.assigned_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'message', 'Lead already assigned', 'assigned_user_id', v_lead.assigned_user_id);
  END IF;

  -- 2. Find active round-robin queue using rules (SEM FALLBACK)
  v_round_robin_id := public.pick_round_robin_for_lead(p_lead_id);
  
  -- ========= CORREÇÃO: REMOVER FALLBACK =========
  -- Se não houver regra que case, o lead NÃO é distribuído automaticamente
  -- Ele permanece no pool/bolsão aguardando atribuição manual
  IF v_round_robin_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true, 
      'message', 'No matching distribution rule - lead will remain in pool',
      'assigned_user_id', NULL,
      'round_robin_used', false
    );
  END IF;
  
  -- Get queue data
  SELECT * INTO v_queue FROM round_robins WHERE id = v_round_robin_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue not found');
  END IF;

  -- Capture target pipeline/stage from queue
  v_target_pipeline_id := v_queue.target_pipeline_id;
  v_target_stage_id := v_queue.target_stage_id;
  
  -- If queue has pipeline/stage configured, apply them
  IF v_target_pipeline_id IS NOT NULL THEN
    UPDATE leads 
    SET pipeline_id = v_target_pipeline_id
    WHERE id = p_lead_id AND (pipeline_id IS NULL OR pipeline_id != v_target_pipeline_id);
  END IF;
  
  IF v_target_stage_id IS NOT NULL THEN
    UPDATE leads 
    SET stage_id = v_target_stage_id
    WHERE id = p_lead_id AND (stage_id IS NULL OR stage_id != v_target_stage_id);
  END IF;

  -- 3. Expand team members and count total participants
  WITH expanded_members AS (
    SELECT 
      COALESCE(tm.user_id, rrm.user_id) as user_id,
      rrm.weight,
      rrm.position
    FROM round_robin_members rrm
    LEFT JOIN team_members tm ON tm.team_id = rrm.team_id
    WHERE rrm.round_robin_id = v_round_robin_id
      AND (rrm.user_id IS NOT NULL OR tm.user_id IS NOT NULL)
  )
  SELECT COUNT(*) INTO v_member_count FROM expanded_members WHERE user_id IS NOT NULL;

  IF v_member_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No members in queue');
  END IF;

  -- 4. Simple round-robin: get next available member by position
  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > v_max_attempts THEN
      RETURN jsonb_build_object('success', false, 'error', 'Max attempts reached');
    END IF;

    v_next_index := COALESCE(v_queue.last_assigned_index, 0);
    
    -- Find member at current position (with expansion for teams)
    WITH expanded_members AS (
      SELECT 
        COALESCE(tm.user_id, rrm.user_id) as user_id,
        rrm.weight,
        ROW_NUMBER() OVER (ORDER BY rrm.position, tm.user_id) - 1 as calc_position
      FROM round_robin_members rrm
      LEFT JOIN team_members tm ON tm.team_id = rrm.team_id
      WHERE rrm.round_robin_id = v_round_robin_id
        AND (rrm.user_id IS NOT NULL OR tm.user_id IS NOT NULL)
    )
    SELECT user_id INTO v_assigned_user_id
    FROM expanded_members
    WHERE calc_position = v_next_index % v_member_count
    LIMIT 1;

    UPDATE round_robins 
    SET last_assigned_index = (v_next_index + 1) % v_member_count
    WHERE id = v_round_robin_id;
    
    v_queue.last_assigned_index := (v_next_index + 1) % v_member_count;

    -- Check availability
    IF v_assigned_user_id IS NOT NULL AND public.is_member_available(v_assigned_user_id) THEN
      -- Assign lead
      UPDATE leads 
      SET 
        assigned_user_id = v_assigned_user_id,
        assigned_at = NOW()
      WHERE id = p_lead_id;

      -- Update stats
      UPDATE round_robins 
      SET leads_distributed = COALESCE(leads_distributed, 0) + 1 
      WHERE id = v_round_robin_id;

      -- Log assignment
      INSERT INTO assignments_log (lead_id, assigned_user_id, round_robin_id, organization_id, reason)
      VALUES (p_lead_id, v_assigned_user_id, v_round_robin_id, v_lead.organization_id, 'round_robin');

      -- Get user name for activity
      SELECT name INTO v_user_name FROM users WHERE id = v_assigned_user_id;

      -- Register activity with distribution queue name
      INSERT INTO activities (lead_id, type, content, user_id, metadata)
      VALUES (
        p_lead_id,
        'assignee_changed',
        CASE WHEN v_is_redistribution 
          THEN 'Redistribuído por "' || v_queue.name || '" para ' || COALESCE(v_user_name, 'usuário')
          ELSE 'Distribuído por "' || v_queue.name || '" para ' || COALESCE(v_user_name, 'usuário')
        END,
        v_assigned_user_id,
        jsonb_build_object(
          'distribution_queue_id', v_round_robin_id,
          'distribution_queue_name', v_queue.name,
          'from_user_id', NULL,
          'to_user_id', v_assigned_user_id,
          'to_user_name', v_user_name,
          'is_initial_distribution', NOT v_is_redistribution
        )
      );

      RETURN jsonb_build_object(
        'success', true,
        'assigned_user_id', v_assigned_user_id,
        'round_robin_id', v_round_robin_id,
        'round_robin_used', true,
        'pipeline_id', v_target_pipeline_id,
        'stage_id', v_target_stage_id,
        'is_redistribution', v_is_redistribution
      );
    END IF;
  END LOOP;
END;
$$;