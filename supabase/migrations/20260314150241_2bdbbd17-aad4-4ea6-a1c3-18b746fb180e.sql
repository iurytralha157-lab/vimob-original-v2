
CREATE OR REPLACE FUNCTION public.is_member_available(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
  v_availability RECORD; 
  v_current_day INTEGER; 
  v_current_time TIME;
  v_team_member_id UUID;
  v_has_any_availability BOOLEAN;
BEGIN
  v_current_day := EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Sao_Paulo');
  v_current_time := (NOW() AT TIME ZONE 'America/Sao_Paulo')::TIME;
  
  -- Find the team_member_id for this user
  SELECT id INTO v_team_member_id 
  FROM public.team_members 
  WHERE user_id = p_user_id 
  LIMIT 1;
  
  -- If no team member record, assume available
  IF v_team_member_id IS NULL THEN 
    RETURN true; 
  END IF;
  
  -- Check if member has ANY availability records at all
  SELECT EXISTS (
    SELECT 1 FROM public.member_availability 
    WHERE team_member_id = v_team_member_id AND is_active = true
  ) INTO v_has_any_availability;
  
  -- If no availability configured at all, assume available
  IF NOT v_has_any_availability THEN
    RETURN true;
  END IF;
  
  -- Check availability for current day
  SELECT * INTO v_availability 
  FROM public.member_availability 
  WHERE team_member_id = v_team_member_id 
  AND day_of_week = v_current_day 
  AND is_active = true 
  LIMIT 1;
  
  -- If no availability record for TODAY but has records for other days,
  -- member is NOT available today
  IF NOT FOUND THEN 
    RETURN false; 
  END IF;
  
  -- If is_all_day, member is available all day
  IF v_availability.is_all_day THEN
    RETURN true;
  END IF;
  
  -- Check if current time is within availability window
  IF v_availability.start_time IS NULL OR v_availability.end_time IS NULL THEN
    RETURN true;
  END IF;
  
  RETURN v_current_time BETWEEN v_availability.start_time AND v_availability.end_time;
END;
$function$;
