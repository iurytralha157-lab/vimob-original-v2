-- Fix PL/pgSQL ambiguity between the output column team_member_id and the
-- member_availability.team_member_id column.

CREATE OR REPLACE FUNCTION public.is_user_available_for_distribution(
  p_user_id uuid,
  p_team_id uuid,
  p_current_day integer,
  p_current_time time
)
RETURNS TABLE(is_available boolean, reason text, team_member_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_has_team_members boolean;
  v_has_availability_config boolean;
  v_default_available boolean;
  v_target_team_member_id uuid;
BEGIN
  v_default_available := p_current_day BETWEEN 1 AND 5
    AND p_current_time BETWEEN '08:00:00'::time AND '18:00:00'::time;

  IF p_team_id IS NOT NULL THEN
    SELECT tm.id INTO v_target_team_member_id
    FROM public.team_members tm
    WHERE tm.user_id = p_user_id
      AND tm.team_id = p_team_id
    LIMIT 1;

    IF v_target_team_member_id IS NULL THEN
      RETURN QUERY SELECT false, 'team_member_not_found'::text, NULL::uuid;
      RETURN;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.member_availability ma
      WHERE ma.team_member_id = v_target_team_member_id
        AND ma.is_active = true
    ) INTO v_has_availability_config;

    IF NOT v_has_availability_config THEN
      RETURN QUERY SELECT v_default_available, 'team_user_default_weekday_schedule'::text, v_target_team_member_id;
      RETURN;
    END IF;

    RETURN QUERY
    SELECT EXISTS (
      SELECT 1
      FROM public.member_availability ma
      WHERE ma.team_member_id = v_target_team_member_id
        AND ma.day_of_week = p_current_day
        AND ma.is_active = true
        AND (
          ma.is_all_day = true
          OR (
            ma.start_time IS NOT NULL
            AND ma.end_time IS NOT NULL
            AND (
              (ma.start_time <= ma.end_time AND p_current_time BETWEEN ma.start_time AND ma.end_time)
              OR
              (ma.start_time > ma.end_time AND (p_current_time >= ma.start_time OR p_current_time <= ma.end_time))
            )
          )
        )
    ),
    'team_user_schedule_checked'::text,
    v_target_team_member_id;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.user_id = p_user_id
  ) INTO v_has_team_members;

  IF NOT v_has_team_members THEN
    RETURN QUERY SELECT true, 'direct_user_no_team_24h'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.member_availability ma
    JOIN public.team_members tm ON tm.id = ma.team_member_id
    WHERE tm.user_id = p_user_id
      AND ma.is_active = true
  ) INTO v_has_availability_config;

  IF NOT v_has_availability_config THEN
    RETURN QUERY SELECT v_default_available, 'direct_user_default_weekday_schedule'::text, NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT EXISTS (
    SELECT 1
    FROM public.member_availability ma
    JOIN public.team_members tm ON tm.id = ma.team_member_id
    WHERE tm.user_id = p_user_id
      AND ma.day_of_week = p_current_day
      AND ma.is_active = true
      AND (
        ma.is_all_day = true
        OR (
          ma.start_time IS NOT NULL
          AND ma.end_time IS NOT NULL
          AND (
            (ma.start_time <= ma.end_time AND p_current_time BETWEEN ma.start_time AND ma.end_time)
            OR
            (ma.start_time > ma.end_time AND (p_current_time >= ma.start_time OR p_current_time <= ma.end_time))
          )
        )
      )
  ),
  'direct_user_schedule_checked'::text,
  NULL::uuid;
END;
$function$;
