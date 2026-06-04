CREATE OR REPLACE FUNCTION public.is_member_available(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
  v_current_day INTEGER; 
  v_current_time TIME;
  v_records_exist BOOLEAN;
  v_team_member_ids UUID[];
BEGIN
  v_current_day := EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Sao_Paulo');
  v_current_time := (NOW() AT TIME ZONE 'America/Sao_Paulo')::TIME;
  
  -- Busca TODOS os team_member_ids do usuário
  SELECT ARRAY_AGG(id) INTO v_team_member_ids 
  FROM public.team_members 
  WHERE user_id = p_user_id;
  
  -- Se o usuário não está em nenhuma equipe, disponível por padrão
  IF v_team_member_ids IS NULL OR array_length(v_team_member_ids, 1) IS NULL THEN 
    RETURN true; 
  END IF;
  
  -- Verifica se existe QUALQUER registro de disponibilidade para este usuário
  SELECT EXISTS (
    SELECT 1 FROM public.member_availability 
    WHERE team_member_id = ANY(v_team_member_ids)
  ) INTO v_records_exist;
  
  -- Se não configurou disponibilidade ainda, disponível por padrão
  IF NOT v_records_exist THEN
    RETURN true;
  END IF;
  
  -- Verifica se está disponível HOJE em qualquer equipe (precisa ter pelo menos um dia ativo)
  RETURN EXISTS (
    SELECT 1 FROM public.member_availability
    WHERE team_member_id = ANY(v_team_member_ids)
    AND day_of_week = v_current_day
    AND is_active = true
    AND (
      is_all_day = true
      OR (start_time IS NOT NULL AND end_time IS NOT NULL 
          AND v_current_time BETWEEN start_time AND end_time)
      OR (start_time IS NULL AND end_time IS NULL)
    )
  );
END;
$function$;
