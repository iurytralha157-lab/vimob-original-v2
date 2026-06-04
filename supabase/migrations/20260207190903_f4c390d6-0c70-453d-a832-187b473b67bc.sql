-- Corrige a função list_contacts_paginated com os nomes de colunas RBAC corretos
-- A função anterior tinha erros: role_id -> organization_role_id, permission_id -> permission_key

DROP FUNCTION IF EXISTS public.list_contacts_paginated(
  text, uuid, uuid, uuid, boolean, uuid, text, text, text, text, text, text, integer, integer
);

CREATE OR REPLACE FUNCTION public.list_contacts_paginated(
  p_search text DEFAULT NULL,
  p_pipeline_id uuid DEFAULT NULL,
  p_stage_id uuid DEFAULT NULL,
  p_assignee_id uuid DEFAULT NULL,
  p_unassigned boolean DEFAULT false,
  p_tag_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_deal_status text DEFAULT NULL,
  p_created_from text DEFAULT NULL,
  p_created_to text DEFAULT NULL,
  p_sort_by text DEFAULT 'created_at',
  p_sort_dir text DEFAULT 'desc',
  p_page integer DEFAULT 1,
  p_limit integer DEFAULT 25
)
RETURNS TABLE (
  id uuid,
  name text,
  phone text,
  email text,
  pipeline_id uuid,
  stage_id uuid,
  stage_name text,
  stage_color text,
  assigned_user_id uuid,
  assignee_name text,
  assignee_avatar text,
  source text,
  created_at timestamptz,
  sla_status text,
  last_interaction_at timestamptz,
  last_interaction_preview text,
  last_interaction_channel text,
  tags jsonb,
  total_count bigint,
  deal_status text,
  lost_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_user_role text;
  v_can_view_all boolean;
  v_can_view_team boolean;
  v_team_member_ids uuid[];
  v_offset integer;
  v_total bigint;
BEGIN
  -- Get current user info
  v_user_id := auth.uid();
  
  SELECT organization_id, role INTO v_org_id, v_user_role
  FROM users
  WHERE users.id = v_user_id;
  
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Check permissions - CORRIGIDO: usando organization_role_id e permission_key
  IF v_user_role IN ('admin', 'super_admin') THEN
    v_can_view_all := true;
    v_can_view_team := true;
  ELSE
    SELECT 
      EXISTS (
        SELECT 1 
        FROM user_organization_roles uor
        JOIN organization_role_permissions orp 
          ON orp.organization_role_id = uor.organization_role_id
        WHERE uor.user_id = v_user_id 
          AND orp.permission_key = 'lead_view_all'
      ),
      EXISTS (
        SELECT 1 
        FROM user_organization_roles uor
        JOIN organization_role_permissions orp 
          ON orp.organization_role_id = uor.organization_role_id
        WHERE uor.user_id = v_user_id 
          AND orp.permission_key = 'lead_view_team'
      )
    INTO v_can_view_all, v_can_view_team;
  END IF;
  
  -- Get team member IDs if needed
  IF v_can_view_team AND NOT v_can_view_all THEN
    SELECT ARRAY_AGG(DISTINCT tm.user_id)
    INTO v_team_member_ids
    FROM team_members tm
    WHERE tm.team_id IN (
      SELECT t.id FROM teams t
      WHERE t.leader_id = v_user_id
      UNION
      SELECT tm2.team_id FROM team_members tm2
      WHERE tm2.user_id = v_user_id
    );
    
    -- Include the user themselves
    IF v_team_member_ids IS NULL THEN
      v_team_member_ids := ARRAY[v_user_id];
    ELSIF NOT v_user_id = ANY(v_team_member_ids) THEN
      v_team_member_ids := array_append(v_team_member_ids, v_user_id);
    END IF;
  END IF;
  
  v_offset := (p_page - 1) * p_limit;
  
  -- Count total
  SELECT COUNT(*)
  INTO v_total
  FROM leads l
  WHERE l.organization_id = v_org_id
    AND (
      v_can_view_all 
      OR (v_can_view_team AND l.assigned_user_id = ANY(v_team_member_ids))
      OR l.assigned_user_id = v_user_id
    )
    AND (p_search IS NULL OR p_search = '' OR 
         l.name ILIKE '%' || p_search || '%' OR
         l.phone ILIKE '%' || p_search || '%' OR
         l.email ILIKE '%' || p_search || '%')
    AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id)
    AND (p_stage_id IS NULL OR l.stage_id = p_stage_id)
    AND (NOT p_unassigned OR l.assigned_user_id IS NULL)
    AND (p_unassigned OR p_assignee_id IS NULL OR l.assigned_user_id = p_assignee_id)
    AND (p_source IS NULL OR p_source = '' OR l.source = p_source)
    AND (p_deal_status IS NULL OR p_deal_status = '' OR l.deal_status = p_deal_status)
    AND (p_created_from IS NULL OR p_created_from = '' OR l.created_at >= p_created_from::timestamptz)
    AND (p_created_to IS NULL OR p_created_to = '' OR l.created_at <= (p_created_to::date + interval '1 day'))
    AND (p_tag_id IS NULL OR EXISTS (
      SELECT 1 FROM lead_tags lt WHERE lt.lead_id = l.id AND lt.tag_id = p_tag_id
    ));
  
  -- Return data
  RETURN QUERY
  SELECT 
    l.id,
    l.name,
    l.phone,
    l.email,
    l.pipeline_id,
    l.stage_id,
    s.name AS stage_name,
    s.color AS stage_color,
    l.assigned_user_id,
    u.name AS assignee_name,
    u.avatar_url AS assignee_avatar,
    l.source,
    l.created_at,
    l.sla_status,
    l.last_interaction_at,
    l.last_interaction_preview,
    l.last_interaction_channel,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color))
       FROM lead_tags lt
       JOIN tags t ON t.id = lt.tag_id
       WHERE lt.lead_id = l.id),
      '[]'::jsonb
    ) AS tags,
    v_total AS total_count,
    l.deal_status,
    l.lost_reason
  FROM leads l
  LEFT JOIN stages s ON s.id = l.stage_id
  LEFT JOIN users u ON u.id = l.assigned_user_id
  WHERE l.organization_id = v_org_id
    AND (
      v_can_view_all 
      OR (v_can_view_team AND l.assigned_user_id = ANY(v_team_member_ids))
      OR l.assigned_user_id = v_user_id
    )
    AND (p_search IS NULL OR p_search = '' OR 
         l.name ILIKE '%' || p_search || '%' OR
         l.phone ILIKE '%' || p_search || '%' OR
         l.email ILIKE '%' || p_search || '%')
    AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id)
    AND (p_stage_id IS NULL OR l.stage_id = p_stage_id)
    AND (NOT p_unassigned OR l.assigned_user_id IS NULL)
    AND (p_unassigned OR p_assignee_id IS NULL OR l.assigned_user_id = p_assignee_id)
    AND (p_source IS NULL OR p_source = '' OR l.source = p_source)
    AND (p_deal_status IS NULL OR p_deal_status = '' OR l.deal_status = p_deal_status)
    AND (p_created_from IS NULL OR p_created_from = '' OR l.created_at >= p_created_from::timestamptz)
    AND (p_created_to IS NULL OR p_created_to = '' OR l.created_at <= (p_created_to::date + interval '1 day'))
    AND (p_tag_id IS NULL OR EXISTS (
      SELECT 1 FROM lead_tags lt WHERE lt.lead_id = l.id AND lt.tag_id = p_tag_id
    ))
  ORDER BY
    CASE WHEN p_sort_by = 'created_at' AND p_sort_dir = 'desc' THEN l.created_at END DESC,
    CASE WHEN p_sort_by = 'created_at' AND p_sort_dir = 'asc' THEN l.created_at END ASC,
    CASE WHEN p_sort_by = 'name' AND p_sort_dir = 'desc' THEN l.name END DESC,
    CASE WHEN p_sort_by = 'name' AND p_sort_dir = 'asc' THEN l.name END ASC,
    CASE WHEN p_sort_by = 'last_interaction_at' AND p_sort_dir = 'desc' THEN l.last_interaction_at END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'last_interaction_at' AND p_sort_dir = 'asc' THEN l.last_interaction_at END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'stage' AND p_sort_dir = 'desc' THEN s.position END DESC,
    CASE WHEN p_sort_by = 'stage' AND p_sort_dir = 'asc' THEN s.position END ASC,
    l.created_at DESC
  LIMIT p_limit
  OFFSET v_offset;
END;
$$;