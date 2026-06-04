-- Fix handle_lead_intake function to use correct create_notification signature
CREATE OR REPLACE FUNCTION public.handle_lead_intake(p_lead_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
  v_lead RECORD; 
  v_round_robin RECORD; 
  v_member RECORD; 
  v_assigned_user_id UUID; 
  v_round_robin_id UUID; 
  v_total_weight INTEGER; 
  v_random_weight INTEGER; 
  v_cumulative_weight INTEGER := 0; 
  v_first_stage_id UUID; 
  v_pipeline RECORD; 
  v_reason TEXT;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN 
    RETURN jsonb_build_object('success', false, 'error', 'Lead not found'); 
  END IF;
  
  IF v_lead.assigned_user_id IS NOT NULL THEN 
    RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id, 'assigned_user_id', v_lead.assigned_user_id, 'round_robin_used', false); 
  END IF;
  
  -- Assign to default pipeline if none
  IF v_lead.pipeline_id IS NULL THEN 
    SELECT id, default_round_robin_id INTO v_pipeline 
    FROM public.pipelines 
    WHERE organization_id = v_lead.organization_id 
    ORDER BY created_at ASC LIMIT 1; 
    
    IF FOUND THEN 
      UPDATE public.leads SET pipeline_id = v_pipeline.id WHERE id = p_lead_id; 
      v_lead.pipeline_id := v_pipeline.id; 
    END IF; 
  END IF;
  
  -- Assign to first stage if none
  IF v_lead.stage_id IS NULL AND v_lead.pipeline_id IS NOT NULL THEN 
    SELECT id INTO v_first_stage_id 
    FROM public.stages 
    WHERE pipeline_id = v_lead.pipeline_id 
    ORDER BY position ASC LIMIT 1; 
    
    IF FOUND THEN 
      UPDATE public.leads SET stage_id = v_first_stage_id, stage_entered_at = NOW() WHERE id = p_lead_id; 
    END IF; 
  END IF;
  
  -- Pick round robin
  v_round_robin_id := public.pick_round_robin_for_lead(p_lead_id);
  IF v_round_robin_id IS NULL THEN 
    RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id, 'assigned_user_id', NULL, 'round_robin_used', false, 'reason', 'No active round-robin'); 
  END IF;
  
  SELECT * INTO v_round_robin FROM public.round_robins WHERE id = v_round_robin_id;
  
  -- Weighted strategy
  IF v_round_robin.strategy = 'weighted' THEN
    SELECT SUM(COALESCE(weight, 1)) INTO v_total_weight 
    FROM public.round_robin_members 
    WHERE round_robin_id = v_round_robin_id 
    AND public.is_member_available(user_id);
    
    IF v_total_weight > 0 THEN 
      v_random_weight := floor(random() * v_total_weight)::INTEGER; 
      
      FOR v_member IN 
        SELECT * FROM public.round_robin_members 
        WHERE round_robin_id = v_round_robin_id 
        AND public.is_member_available(user_id) 
        ORDER BY position ASC 
      LOOP 
        v_cumulative_weight := v_cumulative_weight + COALESCE(v_member.weight, 1); 
        IF v_random_weight < v_cumulative_weight THEN 
          v_assigned_user_id := v_member.user_id; 
          v_reason := 'Weighted distribution'; 
          EXIT; 
        END IF; 
      END LOOP; 
    END IF;
  ELSE
    -- Simple round robin
    SELECT user_id INTO v_assigned_user_id 
    FROM public.round_robin_members 
    WHERE round_robin_id = v_round_robin_id 
    AND public.is_member_available(user_id) 
    ORDER BY COALESCE(leads_count, 0) ASC, position ASC 
    LIMIT 1; 
    v_reason := 'Simple round-robin';
  END IF;
  
  IF v_assigned_user_id IS NOT NULL THEN
    -- Update lead
    UPDATE public.leads 
    SET assigned_user_id = v_assigned_user_id, assigned_at = NOW() 
    WHERE id = p_lead_id;
    
    -- Update member count
    UPDATE public.round_robin_members 
    SET leads_count = COALESCE(leads_count, 0) + 1 
    WHERE round_robin_id = v_round_robin_id AND user_id = v_assigned_user_id;
    
    -- Log assignment
    INSERT INTO public.assignments_log (lead_id, user_id, assigned_user_id, round_robin_id, reason, organization_id, assigned_at) 
    VALUES (p_lead_id, v_assigned_user_id, v_assigned_user_id, v_round_robin_id, v_reason, v_lead.organization_id, NOW());
    
    -- Create activity
    INSERT INTO public.activities (lead_id, organization_id, type, description, created_by) 
    VALUES (p_lead_id, v_lead.organization_id, 'assignment', 'Lead atribuído automaticamente via round-robin', v_assigned_user_id);
    
    -- Create notification with CORRECT signature: (user_id, org_id, title, content, type, lead_id)
    PERFORM public.create_notification(
      v_assigned_user_id, 
      v_lead.organization_id,
      'Novo lead atribuído', 
      'Você recebeu um novo lead: ' || COALESCE(v_lead.name, 'Sem nome'), 
      'lead',
      p_lead_id
    );
    
    RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id, 'assigned_user_id', v_assigned_user_id, 'round_robin_id', v_round_robin_id, 'round_robin_used', true, 'reason', v_reason);
  ELSE
    RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id, 'assigned_user_id', NULL, 'round_robin_used', false, 'reason', 'No available members');
  END IF;
END;
$$;