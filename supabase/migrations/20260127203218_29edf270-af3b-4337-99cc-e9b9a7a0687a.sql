-- Primeiro dropar a função existente
DROP FUNCTION IF EXISTS public.list_contacts_paginated(text,uuid,uuid,uuid,boolean,uuid,text,text,text,text,text,integer,integer);

-- Recriar com os novos campos deal_status e lost_reason
CREATE OR REPLACE FUNCTION public.list_contacts_paginated(
  p_search text DEFAULT NULL::text, 
  p_pipeline_id uuid DEFAULT NULL::uuid, 
  p_stage_id uuid DEFAULT NULL::uuid, 
  p_assignee_id uuid DEFAULT NULL::uuid, 
  p_unassigned boolean DEFAULT false, 
  p_tag_id uuid DEFAULT NULL::uuid, 
  p_source text DEFAULT NULL::text, 
  p_created_from text DEFAULT NULL::text, 
  p_created_to text DEFAULT NULL::text, 
  p_sort_by text DEFAULT 'created_at'::text, 
  p_sort_dir text DEFAULT 'desc'::text, 
  p_page integer DEFAULT 1, 
  p_limit integer DEFAULT 25
)
RETURNS TABLE(
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
  created_at timestamp with time zone, 
  sla_status text, 
  last_interaction_at timestamp with time zone, 
  last_interaction_preview text, 
  last_interaction_channel text, 
  tags jsonb, 
  total_count bigint,
  deal_status text,
  lost_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_is_admin BOOLEAN;
  v_is_super_admin BOOLEAN;
  v_can_view_all BOOLEAN := FALSE;
  v_can_view_team BOOLEAN := FALSE;
  v_team_member_ids UUID[];
  v_offset INT;
  v_total BIGINT;
BEGIN
  -- Get current user info
  SELECT u.organization_id, u.id, (u.role = 'admin'), (u.role = 'super_admin')
  INTO v_org_id, v_user_id, v_is_admin, v_is_super_admin
  FROM users u WHERE u.id = auth.uid();

  IF v_user_id IS NULL THEN RETURN; END IF;
  IF v_org_id IS NULL AND NOT v_is_super_admin THEN RETURN; END IF;

  -- Check custom RBAC permissions for non-admin users
  IF NOT v_is_admin AND NOT v_is_super_admin THEN
    v_can_view_all := public.user_has_permission('lead_view_all', v_user_id);
    v_can_view_team := public.user_has_permission('lead_view_team', v_user_id);
    
    IF v_can_view_team AND NOT v_can_view_all THEN
      SELECT ARRAY_AGG(DISTINCT tm.user_id) INTO v_team_member_ids
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      WHERE t.id IN (
        SELECT tm2.team_id FROM team_members tm2 WHERE tm2.user_id = v_user_id
      );
    END IF;
  END IF;

  v_offset := (p_page - 1) * p_limit;

  -- Count total with proper permission filtering
  SELECT COUNT(DISTINCT l.id) INTO v_total
  FROM leads l
  WHERE 
    (v_is_super_admin OR l.organization_id = v_org_id)
    AND (
      v_is_admin 
      OR v_is_super_admin 
      OR v_can_view_all
      OR (v_can_view_team AND l.assigned_user_id = ANY(v_team_member_ids))
      OR l.assigned_user_id = v_user_id
    )
    AND (p_search IS NULL OR l.name ILIKE '%' || p_search || '%' OR l.email ILIKE '%' || p_search || '%' OR l.phone ILIKE '%' || p_search || '%')
    AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id)
    AND (p_stage_id IS NULL OR l.stage_id = p_stage_id)
    AND (NOT p_unassigned OR l.assigned_user_id IS NULL)
    AND (p_unassigned OR p_assignee_id IS NULL OR l.assigned_user_id = p_assignee_id)
    AND (p_tag_id IS NULL OR l.id IN (SELECT lt.lead_id FROM lead_tags lt WHERE lt.tag_id = p_tag_id))
    AND (p_source IS NULL OR l.source::TEXT = p_source)
    AND (p_created_from IS NULL OR l.created_at >= p_created_from::TIMESTAMPTZ)
    AND (p_created_to IS NULL OR l.created_at <= p_created_to::TIMESTAMPTZ);

  -- Return results with proper permission filtering
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
    l.source::TEXT,
    l.created_at,
    NULL::TEXT AS sla_status,
    l.updated_at AS last_interaction_at,
    NULL::TEXT AS last_interaction_preview,
    NULL::TEXT AS last_interaction_channel,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color))
       FROM lead_tags lt2
       JOIN tags t ON t.id = lt2.tag_id
       WHERE lt2.lead_id = l.id),
      '[]'::jsonb
    ) AS tags,
    v_total AS total_count,
    l.deal_status::TEXT,
    l.lost_reason
  FROM leads l
  LEFT JOIN stages s ON s.id = l.stage_id
  LEFT JOIN users u ON u.id = l.assigned_user_id
  WHERE 
    (v_is_super_admin OR l.organization_id = v_org_id)
    AND (
      v_is_admin 
      OR v_is_super_admin 
      OR v_can_view_all
      OR (v_can_view_team AND l.assigned_user_id = ANY(v_team_member_ids))
      OR l.assigned_user_id = v_user_id
    )
    AND (p_search IS NULL OR l.name ILIKE '%' || p_search || '%' OR l.email ILIKE '%' || p_search || '%' OR l.phone ILIKE '%' || p_search || '%')
    AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id)
    AND (p_stage_id IS NULL OR l.stage_id = p_stage_id)
    AND (NOT p_unassigned OR l.assigned_user_id IS NULL)
    AND (p_unassigned OR p_assignee_id IS NULL OR l.assigned_user_id = p_assignee_id)
    AND (p_tag_id IS NULL OR l.id IN (SELECT lt3.lead_id FROM lead_tags lt3 WHERE lt3.tag_id = p_tag_id))
    AND (p_source IS NULL OR l.source::TEXT = p_source)
    AND (p_created_from IS NULL OR l.created_at >= p_created_from::TIMESTAMPTZ)
    AND (p_created_to IS NULL OR l.created_at <= p_created_to::TIMESTAMPTZ)
  ORDER BY
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_by WHEN 'created_at' THEN l.created_at WHEN 'last_interaction_at' THEN l.updated_at ELSE l.created_at END
    END DESC NULLS LAST,
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_by WHEN 'created_at' THEN l.created_at WHEN 'last_interaction_at' THEN l.updated_at ELSE l.created_at END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' AND p_sort_by = 'name' THEN l.name END DESC NULLS LAST,
    CASE WHEN p_sort_dir = 'asc' AND p_sort_by = 'name' THEN l.name END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' AND p_sort_by = 'stage' THEN s.name END DESC NULLS LAST,
    CASE WHEN p_sort_dir = 'asc' AND p_sort_by = 'stage' THEN s.name END ASC NULLS LAST,
    l.id
  LIMIT p_limit OFFSET v_offset;
END;
$function$;