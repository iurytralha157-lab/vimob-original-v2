-- Drop and recreate get_funnel_data with pipeline_id parameter
DROP FUNCTION IF EXISTS public.get_funnel_data(TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.get_funnel_data(
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_team_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_source TEXT DEFAULT NULL,
  p_pipeline_id UUID DEFAULT NULL
)
RETURNS TABLE(
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
  v_pipeline_id UUID;
BEGIN
  -- Get current user's organization
  v_org_id := get_user_organization_id();
  
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  -- Use provided pipeline_id or get the default/first available pipeline
  IF p_pipeline_id IS NOT NULL THEN
    v_pipeline_id := p_pipeline_id;
  ELSE
    SELECT id INTO v_pipeline_id
    FROM pipelines
    WHERE organization_id = v_org_id
    ORDER BY is_default DESC NULLS LAST, created_at ASC
    LIMIT 1;
  END IF;

  IF v_pipeline_id IS NULL THEN
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
  WHERE s.pipeline_id = v_pipeline_id
  GROUP BY s.id, s.name, s.stage_key, s.position
  ORDER BY s.position;
END;
$$;

-- Drop and recreate get_lead_sources_data with pipeline_id parameter
DROP FUNCTION IF EXISTS public.get_lead_sources_data(TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.get_lead_sources_data(
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_team_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_source TEXT DEFAULT NULL,
  p_pipeline_id UUID DEFAULT NULL
)
RETURNS TABLE(
  source_name TEXT,
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
    COALESCE(l.source::TEXT, 'manual') AS source_name,
    COUNT(*) AS lead_count
  FROM leads l
  WHERE l.organization_id = v_org_id
    -- Pipeline filter (filter by leads in stages of this pipeline)
    AND (p_pipeline_id IS NULL OR l.stage_id IN (
      SELECT s.id FROM stages s WHERE s.pipeline_id = p_pipeline_id
    ))
    -- Date filter
    AND (p_date_from IS NULL OR l.created_at >= p_date_from)
    AND (p_date_to IS NULL OR l.created_at <= p_date_to)
    -- Team filter
    AND (p_team_id IS NULL OR l.assigned_user_id = ANY(v_team_member_ids))
    -- User filter
    AND (p_user_id IS NULL OR l.assigned_user_id = p_user_id)
    -- Source filter (if specific source selected, only show that source)
    AND (p_source IS NULL OR p_source = 'all' OR l.source::TEXT = p_source)
  GROUP BY l.source
  ORDER BY lead_count DESC;
END;
$$;