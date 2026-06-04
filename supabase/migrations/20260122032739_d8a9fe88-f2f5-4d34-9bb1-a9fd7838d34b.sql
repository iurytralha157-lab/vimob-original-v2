-- Fix is_member_available function - table uses team_member_id, not user_id
CREATE OR REPLACE FUNCTION public.is_member_available(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
  v_availability RECORD; 
  v_current_day INTEGER; 
  v_current_time TIME;
  v_team_member_id UUID;
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
  
  -- Check availability using team_member_id
  SELECT * INTO v_availability 
  FROM public.member_availability 
  WHERE team_member_id = v_team_member_id 
  AND day_of_week = v_current_day 
  AND is_active = true 
  LIMIT 1;
  
  -- If no availability record, assume available
  IF NOT FOUND THEN 
    RETURN true; 
  END IF;
  
  -- Check if current time is within availability window
  RETURN v_current_time BETWEEN v_availability.start_time AND v_availability.end_time;
END;
$$;