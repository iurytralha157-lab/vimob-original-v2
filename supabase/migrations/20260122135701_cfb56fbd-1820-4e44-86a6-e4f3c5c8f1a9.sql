-- Drop and recreate handle_lead_intake function with correct activities insert
DROP FUNCTION IF EXISTS public.handle_lead_intake(uuid);

CREATE OR REPLACE FUNCTION public.handle_lead_intake(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_queue RECORD;
  v_assigned_user_id uuid;
  v_next_index int;
BEGIN
  -- Get lead data
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  
  IF NOT FOUND OR v_lead.assigned_user_id IS NOT NULL THEN
    RETURN; -- Lead not found or already assigned
  END IF;

  -- Find active round-robin queue for this pipeline
  SELECT rr.* INTO v_queue
  FROM public.round_robins rr
  WHERE rr.pipeline_id = v_lead.pipeline_id
    AND rr.is_active = true
  ORDER BY rr.created_at ASC
  LIMIT 1;

  IF NOT FOUND OR v_queue.members IS NULL OR array_length(v_queue.members, 1) IS NULL THEN
    RETURN; -- No active queue or no members
  END IF;

  -- Get next member using round-robin
  v_next_index := COALESCE(v_queue.current_index, 0);
  IF v_next_index >= array_length(v_queue.members, 1) THEN
    v_next_index := 0;
  END IF;
  
  v_assigned_user_id := v_queue.members[v_next_index + 1]; -- PostgreSQL arrays are 1-indexed

  -- Assign lead to user
  UPDATE public.leads 
  SET assigned_user_id = v_assigned_user_id 
  WHERE id = p_lead_id;

  -- Update round-robin index
  UPDATE public.round_robins 
  SET current_index = v_next_index + 1,
      last_assigned_at = NOW()
  WHERE id = v_queue.id;

  -- Log assignment (activities table does NOT have organization_id column)
  INSERT INTO public.activities (lead_id, user_id, type, content)
  VALUES (
    p_lead_id,
    v_assigned_user_id,
    'assignment',
    'Lead atribuído automaticamente via round-robin'
  );

  -- Log to assignments_log if table exists
  INSERT INTO public.assignments_log (lead_id, user_id, round_robin_id, assigned_at)
  VALUES (p_lead_id, v_assigned_user_id, v_queue.id, NOW())
  ON CONFLICT DO NOTHING;

END;
$$;