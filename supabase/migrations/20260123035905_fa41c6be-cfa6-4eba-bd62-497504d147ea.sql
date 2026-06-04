-- Fix get_funnel_data function - correct column name from s.key to s.stage_key
DROP FUNCTION IF EXISTS public.get_funnel_data(TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.get_funnel_data(
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_team_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_source TEXT DEFAULT NULL
)
RETURNS TABLE (
  stage_id UUID,
  stage_name TEXT,
  stage_key TEXT,
  stage_order INT,
  lead_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_team_member_ids UUID[];
BEGIN
  -- Get current user's organization
  v_org_id := get_user_organization_id();
  
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  -- If team filter is set, get team member IDs
  IF p_team_id IS NOT NULL THEN
    SELECT ARRAY_AGG(tm.user_id) INTO v_team_member_ids
    FROM team_members tm
    WHERE tm.team_id = p_team_id;
  END IF;

  RETURN QUERY
  SELECT 
    s.id AS stage_id,
    s.name AS stage_name,
    COALESCE(s.stage_key, s.name) AS stage_key,
    s.position AS stage_order,
    COUNT(l.id) AS lead_count
  FROM stages s
  LEFT JOIN pipelines p ON s.pipeline_id = p.id
  LEFT JOIN leads l ON l.stage_id = s.id
    AND l.organization_id = v_org_id
    -- Date filter
    AND (p_date_from IS NULL OR l.created_at >= p_date_from)
    AND (p_date_to IS NULL OR l.created_at <= p_date_to)
    -- Team filter (check if assigned user is in team)
    AND (p_team_id IS NULL OR l.assigned_user_id = ANY(v_team_member_ids))
    -- User filter
    AND (p_user_id IS NULL OR l.assigned_user_id = p_user_id)
    -- Source filter
    AND (p_source IS NULL OR p_source = 'all' OR l.source::TEXT = p_source)
  WHERE p.organization_id = v_org_id
    AND p.is_active = TRUE
  GROUP BY s.id, s.name, s.stage_key, s.position
  ORDER BY s.position;
END;
$$;