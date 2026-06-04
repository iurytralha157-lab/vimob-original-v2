-- Fix list_contacts_paginated - correct column reference
CREATE OR REPLACE FUNCTION public.list_contacts_paginated(
  p_search TEXT DEFAULT NULL,
  p_pipeline_id UUID DEFAULT NULL,
  p_stage_id UUID DEFAULT NULL,
  p_assignee_id UUID DEFAULT NULL,
  p_unassigned BOOLEAN DEFAULT FALSE,
  p_tag_id UUID DEFAULT NULL,
  p_source TEXT DEFAULT NULL,
  p_deal_status TEXT DEFAULT NULL,
  p_created_from TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_created_to TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_sort_by TEXT DEFAULT 'created_at',
  p_sort_dir TEXT DEFAULT 'desc',
  p_page INTEGER DEFAULT 1,
  p_limit INTEGER DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  phone TEXT,
  email TEXT,
  pipeline_id UUID,
  pipeline_name TEXT,
  stage_id UUID,
  stage_name TEXT,
  stage_color TEXT,
  assigned_user_id UUID,
  assignee_name TEXT,
  assignee_avatar TEXT,
  source TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  sla_status TEXT,
  last_interaction_at TIMESTAMP WITH TIME ZONE,
  last_interaction_preview TEXT,
  last_interaction_channel TEXT,
  tags JSONB,
  total_count BIGINT,
  deal_status TEXT,
  lost_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_is_super_admin BOOLEAN;
  v_can_view_all BOOLEAN;
  v_can_view_team BOOLEAN;
  v_user_team_ids UUID[];
  v_offset INTEGER;
  v_total BIGINT;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  -- Get user's organization and check super admin (using correct column)
  SELECT 
    u.organization_id, 
    COALESCE(u.role = 'super_admin', FALSE)
  INTO v_org_id, v_is_super_admin
  FROM users u
  WHERE u.id = v_user_id;
  
  -- Get permissions
  SELECT 
    COALESCE(bool_or(rp.permission_key = 'lead_view_all'), FALSE),
    COALESCE(bool_or(rp.permission_key = 'lead_view_team'), FALSE)
  INTO v_can_view_all, v_can_view_team
  FROM organization_roles r
  JOIN role_permissions rp ON rp.role_id = r.id
  JOIN users u ON u.role_id = r.id
  WHERE u.id = v_user_id;
  
  -- Get user's team IDs
  SELECT ARRAY_AGG(tm.team_id)
  INTO v_user_team_ids
  FROM team_members tm
  WHERE tm.user_id = v_user_id;
  
  v_offset := (p_page - 1) * p_limit;
  
  -- Get total count
  SELECT COUNT(*) INTO v_total
  FROM leads l
  LEFT JOIN pipeline_stages ps ON ps.id = l.stage_id
  LEFT JOIN pipelines p ON p.id = l.pipeline_id
  LEFT JOIN users a ON a.id = l.assigned_user_id
  WHERE (v_is_super_admin OR l.organization_id = v_org_id)
    AND (
      v_is_super_admin 
      OR v_can_view_all 
      OR (v_can_view_team AND (
        l.assigned_user_id = v_user_id 
        OR EXISTS (
          SELECT 1 FROM team_members tm2 
          WHERE tm2.team_id = ANY(v_user_team_ids) 
          AND tm2.user_id = l.assigned_user_id
        )
      ))
      OR l.assigned_user_id = v_user_id
      OR l.assigned_user_id IS NULL
    )
    AND (p_search IS NULL OR 
         l.name ILIKE '%' || p_search || '%' OR 
         l.email ILIKE '%' || p_search || '%' OR
         l.phone ILIKE '%' || p_search || '%')
    AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id)
    AND (p_stage_id IS NULL OR l.stage_id = p_stage_id)
    AND (p_assignee_id IS NULL OR l.assigned_user_id = p_assignee_id)
    AND (NOT p_unassigned OR l.assigned_user_id IS NULL)
    AND (p_source IS NULL OR l.source = p_source)
    AND (p_deal_status IS NULL OR COALESCE(l.deal_status, 'open') = p_deal_status)
    AND (p_created_from IS NULL OR l.created_at >= p_created_from)
    AND (p_created_to IS NULL OR l.created_at <= p_created_to)
    AND (p_tag_id IS NULL OR EXISTS (
      SELECT 1 FROM lead_tags lt WHERE lt.lead_id = l.id AND lt.tag_id = p_tag_id
    ));
  
  -- Return results
  RETURN QUERY
  SELECT 
    l.id,
    l.name,
    l.phone,
    l.email,
    l.pipeline_id,
    p.name AS pipeline_name,
    l.stage_id,
    ps.name AS stage_name,
    ps.color AS stage_color,
    l.assigned_user_id,
    a.name AS assignee_name,
    a.avatar_url AS assignee_avatar,
    l.source,
    l.created_at,
    l.sla_status,
    l.last_interaction_at,
    l.last_interaction_preview,
    l.last_interaction_channel,
    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'color', t.color
      )), '[]'::jsonb)
      FROM lead_tags lt
      JOIN tags t ON t.id = lt.tag_id
      WHERE lt.lead_id = l.id
    ) AS tags,
    v_total AS total_count,
    COALESCE(l.deal_status, 'open') AS deal_status,
    l.lost_reason
  FROM leads l
  LEFT JOIN pipeline_stages ps ON ps.id = l.stage_id
  LEFT JOIN pipelines p ON p.id = l.pipeline_id
  LEFT JOIN users a ON a.id = l.assigned_user_id
  WHERE (v_is_super_admin OR l.organization_id = v_org_id)
    AND (
      v_is_super_admin 
      OR v_can_view_all 
      OR (v_can_view_team AND (
        l.assigned_user_id = v_user_id 
        OR EXISTS (
          SELECT 1 FROM team_members tm2 
          WHERE tm2.team_id = ANY(v_user_team_ids) 
          AND tm2.user_id = l.assigned_user_id
        )
      ))
      OR l.assigned_user_id = v_user_id
      OR l.assigned_user_id IS NULL
    )
    AND (p_search IS NULL OR 
         l.name ILIKE '%' || p_search || '%' OR 
         l.email ILIKE '%' || p_search || '%' OR
         l.phone ILIKE '%' || p_search || '%')
    AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id)
    AND (p_stage_id IS NULL OR l.stage_id = p_stage_id)
    AND (p_assignee_id IS NULL OR l.assigned_user_id = p_assignee_id)
    AND (NOT p_unassigned OR l.assigned_user_id IS NULL)
    AND (p_source IS NULL OR l.source = p_source)
    AND (p_deal_status IS NULL OR COALESCE(l.deal_status, 'open') = p_deal_status)
    AND (p_created_from IS NULL OR l.created_at >= p_created_from)
    AND (p_created_to IS NULL OR l.created_at <= p_created_to)
    AND (p_tag_id IS NULL OR EXISTS (
      SELECT 1 FROM lead_tags lt WHERE lt.lead_id = l.id AND lt.tag_id = p_tag_id
    ))
  ORDER BY
    CASE WHEN p_sort_by = 'name' AND p_sort_dir = 'asc' THEN l.name END ASC,
    CASE WHEN p_sort_by = 'name' AND p_sort_dir = 'desc' THEN l.name END DESC,
    CASE WHEN p_sort_by = 'created_at' AND p_sort_dir = 'asc' THEN l.created_at END ASC,
    CASE WHEN p_sort_by = 'created_at' AND p_sort_dir = 'desc' THEN l.created_at END DESC,
    CASE WHEN p_sort_by = 'last_interaction_at' AND p_sort_dir = 'asc' THEN l.last_interaction_at END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'last_interaction_at' AND p_sort_dir = 'desc' THEN l.last_interaction_at END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'stage' AND p_sort_dir = 'asc' THEN ps.position END ASC,
    CASE WHEN p_sort_by = 'stage' AND p_sort_dir = 'desc' THEN ps.position END DESC,
    l.created_at DESC
  LIMIT p_limit
  OFFSET v_offset;
END;
$$;