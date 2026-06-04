-- Atualizar handle_lead_intake para não inserir em activities durante o trigger
-- O log será feito pelo trigger log_lead_activity quando o assigned_user_id for alterado
CREATE OR REPLACE FUNCTION public.handle_lead_intake(p_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead RECORD;
  v_queue RECORD;
  v_member RECORD;
  v_assigned_user_id uuid;
  v_next_index int;
  v_member_count int;
BEGIN
  -- 1. Get lead data
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  
  IF NOT FOUND OR v_lead.assigned_user_id IS NOT NULL THEN
    RETURN; -- Lead not found or already assigned
  END IF;

  -- 2. Find active round-robin queue for this organization
  SELECT * INTO v_queue
  FROM round_robins
  WHERE organization_id = v_lead.organization_id
    AND is_active = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN; -- No active queue
  END IF;

  -- 3. Count members in this queue
  SELECT COUNT(*) INTO v_member_count
  FROM round_robin_members
  WHERE round_robin_id = v_queue.id;

  IF v_member_count = 0 THEN
    RETURN; -- No members in queue
  END IF;

  -- 4. Calculate next index (round-robin)
  v_next_index := COALESCE(v_queue.last_assigned_index, 0) % v_member_count;

  -- 5. Get next member by position
  SELECT * INTO v_member
  FROM round_robin_members
  WHERE round_robin_id = v_queue.id
  ORDER BY position ASC
  LIMIT 1 OFFSET v_next_index;

  IF NOT FOUND THEN
    SELECT * INTO v_member
    FROM round_robin_members
    WHERE round_robin_id = v_queue.id
    ORDER BY position ASC
    LIMIT 1;
  END IF;

  IF v_member IS NULL THEN
    RETURN;
  END IF;

  v_assigned_user_id := v_member.user_id;

  -- 6. Assign lead to user (o trigger log_lead_activity vai registrar a mudança de assignee)
  UPDATE leads 
  SET assigned_user_id = v_assigned_user_id 
  WHERE id = p_lead_id;

  -- 7. Update round-robin counters
  UPDATE round_robins 
  SET last_assigned_index = v_next_index + 1,
      leads_distributed = COALESCE(leads_distributed, 0) + 1
  WHERE id = v_queue.id;

  -- 8. Update member lead count
  UPDATE round_robin_members
  SET leads_count = COALESCE(leads_count, 0) + 1
  WHERE id = v_member.id;

  -- 9. NÃO inserir em activities aqui - o trigger log_lead_activity já faz isso
  -- quando o assigned_user_id muda

  -- 10. Log to round_robin_logs
  INSERT INTO round_robin_logs (
    round_robin_id, organization_id, lead_id, 
    assigned_user_id, member_id, reason
  )
  VALUES (
    v_queue.id, v_lead.organization_id, p_lead_id,
    v_assigned_user_id, v_member.id, 'Distribuição automática round-robin'
  );

END;
$function$;