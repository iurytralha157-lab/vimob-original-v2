-- Corrigir a função list_contacts_paginated: pipeline_stages -> stages
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
  v_can_view_all boolean := false;
  v_can_view_team boolean := false;
  v_team_user_ids uuid[];
  v_offset integer;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Get user's organization
  SELECT organization_id INTO v_org_id
  FROM users
  WHERE users.id = v_user_id;

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  -- Check permissions using user_organization_roles pivot table
  SELECT 
    EXISTS (
      SELECT 1 
      FROM user_organization_roles uor
      JOIN organization_role_permissions orp ON orp.role_id = uor.role_id
      JOIN available_permissions ap ON ap.id = orp.permission_id
      WHERE uor.user_id = v_user_id 
        AND uor.organization_id = v_org_id
        AND ap.key = 'lead_view_all'
    ),
    EXISTS (
      SELECT 1 
      FROM user_organization_roles uor
      JOIN organization_role_permissions orp ON orp.role_id = uor.role_id
      JOIN available_permissions ap ON ap.id = orp.permission_id
      WHERE uor.user_id = v_user_id 
        AND uor.organization_id = v_org_id
        AND ap.key = 'lead_view_team'
    )
  INTO v_can_view_all, v_can_view_team;

  -- If can view team, get team members
  IF v_can_view_team AND NOT v_can_view_all THEN
    SELECT ARRAY_AGG(DISTINCT tm.user_id)
    INTO v_team_user_ids
    FROM team_members tm
    JOIN team_members my_teams ON my_teams.team_id = tm.team_id
    WHERE my_teams.user_id = v_user_id;
    
    IF v_team_user_ids IS NULL THEN
      v_team_user_ids := ARRAY[v_user_id];
    ELSIF NOT (v_user_id = ANY(v_team_user_ids)) THEN
      v_team_user_ids := array_append(v_team_user_ids, v_user_id);
    END IF;
  END IF;

  v_offset := (p_page - 1) * p_limit;

  RETURN QUERY
  WITH filtered_leads AS (
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
      l.deal_status,
      l.lost_reason,
      -- SLA calculation
      CASE 
        WHEN l.deal_status IN ('won', 'lost') THEN 'closed'
        WHEN l.stage_entered_at IS NULL THEN 'ok'
        WHEN ss.sla_hours IS NULL THEN 'ok'
        WHEN EXTRACT(EPOCH FROM (now() - l.stage_entered_at))/3600 > ss.sla_hours THEN 'breached'
        WHEN EXTRACT(EPOCH FROM (now() - l.stage_entered_at))/3600 > ss.sla_hours * 0.8 THEN 'warning'
        ELSE 'ok'
      END AS sla_status,
      -- Last interaction from whatsapp_messages
      wm.created_at AS last_interaction_at,
      LEFT(wm.content, 100) AS last_interaction_preview,
      'whatsapp' AS last_interaction_channel
    FROM leads l
    LEFT JOIN stages s ON s.id = l.stage_id
    LEFT JOIN users u ON u.id = l.assigned_user_id
    LEFT JOIN stage_sla_settings ss ON ss.stage_id = l.stage_id
    LEFT JOIN LATERAL (
      SELECT wm2.created_at, wm2.content
      FROM whatsapp_messages wm2
      JOIN whatsapp_conversations wc ON wc.id = wm2.conversation_id
      WHERE wc.lead_id = l.id
      ORDER BY wm2.created_at DESC
      LIMIT 1
    ) wm ON true
    WHERE l.organization_id = v_org_id
      -- RBAC visibility
      AND (
        v_can_view_all
        OR (v_can_view_team AND l.assigned_user_id = ANY(v_team_user_ids))
        OR l.assigned_user_id = v_user_id
        OR l.assigned_user_id IS NULL
      )
      -- Search filter
      AND (
        p_search IS NULL 
        OR p_search = ''
        OR l.name ILIKE '%' || p_search || '%'
        OR l.phone ILIKE '%' || p_search || '%'
        OR l.email ILIKE '%' || p_search || '%'
      )
      -- Pipeline filter
      AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id)
      -- Stage filter
      AND (p_stage_id IS NULL OR l.stage_id = p_stage_id)
      -- Assignee filter
      AND (
        (p_unassigned = true AND l.assigned_user_id IS NULL)
        OR (p_unassigned = false AND (p_assignee_id IS NULL OR l.assigned_user_id = p_assignee_id))
      )
      -- Source filter
      AND (p_source IS NULL OR p_source = '' OR l.source = p_source)
      -- Deal status filter
      AND (p_deal_status IS NULL OR p_deal_status = '' OR l.deal_status = p_deal_status)
      -- Date range filter
      AND (p_created_from IS NULL OR p_created_from = '' OR l.created_at >= p_created_from::timestamptz)
      AND (p_created_to IS NULL OR p_created_to = '' OR l.created_at <= (p_created_to::date + interval '1 day')::timestamptz)
      -- Tag filter
      AND (p_tag_id IS NULL OR EXISTS (
        SELECT 1 FROM lead_tags lt WHERE lt.lead_id = l.id AND lt.tag_id = p_tag_id
      ))
  ),
  lead_with_tags AS (
    SELECT 
      fl.*,
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color))
         FROM lead_tags lt
         JOIN tags t ON t.id = lt.tag_id
         WHERE lt.lead_id = fl.id),
        '[]'::jsonb
      ) AS tags
    FROM filtered_leads fl
  ),
  counted AS (
    SELECT COUNT(*) AS total FROM lead_with_tags
  )
  SELECT 
    lwt.id,
    lwt.name,
    lwt.phone,
    lwt.email,
    lwt.pipeline_id,
    lwt.stage_id,
    lwt.stage_name,
    lwt.stage_color,
    lwt.assigned_user_id,
    lwt.assignee_name,
    lwt.assignee_avatar,
    lwt.source,
    lwt.created_at,
    lwt.sla_status,
    lwt.last_interaction_at,
    lwt.last_interaction_preview,
    lwt.last_interaction_channel,
    lwt.tags,
    c.total AS total_count,
    lwt.deal_status,
    lwt.lost_reason
  FROM lead_with_tags lwt
  CROSS JOIN counted c
  ORDER BY
    CASE WHEN p_sort_by = 'created_at' AND p_sort_dir = 'desc' THEN lwt.created_at END DESC,
    CASE WHEN p_sort_by = 'created_at' AND p_sort_dir = 'asc' THEN lwt.created_at END ASC,
    CASE WHEN p_sort_by = 'name' AND p_sort_dir = 'desc' THEN lwt.name END DESC,
    CASE WHEN p_sort_by = 'name' AND p_sort_dir = 'asc' THEN lwt.name END ASC,
    CASE WHEN p_sort_by = 'last_interaction_at' AND p_sort_dir = 'desc' THEN lwt.last_interaction_at END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'last_interaction_at' AND p_sort_dir = 'asc' THEN lwt.last_interaction_at END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'stage' AND p_sort_dir = 'desc' THEN lwt.stage_name END DESC,
    CASE WHEN p_sort_by = 'stage' AND p_sort_dir = 'asc' THEN lwt.stage_name END ASC,
    lwt.created_at DESC
  LIMIT p_limit
  OFFSET v_offset;
END;
$$;