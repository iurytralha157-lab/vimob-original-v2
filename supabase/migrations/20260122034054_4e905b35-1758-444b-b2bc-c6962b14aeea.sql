-- Drop all existing versions of list_contacts_paginated to resolve function overloading conflict
DROP FUNCTION IF EXISTS public.list_contacts_paginated(TEXT, UUID, UUID, UUID, BOOLEAN, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, INT, INT);
DROP FUNCTION IF EXISTS public.list_contacts_paginated(TEXT, UUID, UUID, UUID, BOOLEAN, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT);

-- Recreate with clean signature using TEXT for date params (matches frontend usage)
CREATE OR REPLACE FUNCTION public.list_contacts_paginated(
  p_search TEXT DEFAULT NULL,
  p_pipeline_id UUID DEFAULT NULL,
  p_stage_id UUID DEFAULT NULL,
  p_assignee_id UUID DEFAULT NULL,
  p_unassigned BOOLEAN DEFAULT FALSE,
  p_tag_id UUID DEFAULT NULL,
  p_source TEXT DEFAULT NULL,
  p_created_from TEXT DEFAULT NULL,
  p_created_to TEXT DEFAULT NULL,
  p_sort_by TEXT DEFAULT 'created_at',
  p_sort_dir TEXT DEFAULT 'desc',
  p_page INT DEFAULT 1,
  p_limit INT DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  phone TEXT,
  email TEXT,
  pipeline_id UUID,
  stage_id UUID,
  stage_name TEXT,
  stage_color TEXT,
  assigned_user_id UUID,
  assignee_name TEXT,
  assignee_avatar TEXT,
  source TEXT,
  created_at TIMESTAMPTZ,
  sla_status TEXT,
  last_interaction_at TIMESTAMPTZ,
  last_interaction_preview TEXT,
  last_interaction_channel TEXT,
  tags JSONB,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_is_admin BOOLEAN;
  v_is_super_admin BOOLEAN;
  v_offset INT;
  v_total BIGINT;
BEGIN
  -- Get current user's organization and check admin status
  SELECT u.organization_id, u.id, (u.role = 'admin'), (u.role = 'super_admin')
  INTO v_org_id, v_user_id, v_is_admin, v_is_super_admin
  FROM users u
  WHERE u.id = auth.uid();

  -- If no user found, return empty
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- For regular users with no org, return empty (but super_admins can proceed)
  IF v_org_id IS NULL AND NOT v_is_super_admin THEN
    RETURN;
  END IF;

  v_offset := (p_page - 1) * p_limit;

  -- Count total records with role-based visibility
  SELECT COUNT(DISTINCT l.id)
  INTO v_total
  FROM leads l
  WHERE 
    -- Organization filter: super_admin sees all, others see only their org
    (v_is_super_admin OR l.organization_id = v_org_id)
    -- Role-based visibility: admins/super_admins see all, others see only their own
    AND (v_is_admin OR v_is_super_admin OR l.assigned_user_id = v_user_id)
    AND (p_search IS NULL OR (
      l.name ILIKE '%' || p_search || '%' 
      OR l.email ILIKE '%' || p_search || '%' 
      OR l.phone ILIKE '%' || p_search || '%'
    ))
    AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id)
    AND (p_stage_id IS NULL OR l.stage_id = p_stage_id)
    AND (NOT p_unassigned OR l.assigned_user_id IS NULL)
    AND (p_unassigned OR p_assignee_id IS NULL OR l.assigned_user_id = p_assignee_id)
    AND (p_tag_id IS NULL OR l.id IN (SELECT lt.lead_id FROM lead_tags lt WHERE lt.tag_id = p_tag_id))
    AND (p_source IS NULL OR l.source::TEXT = p_source)
    AND (p_created_from IS NULL OR l.created_at >= p_created_from::TIMESTAMPTZ)
    AND (p_created_to IS NULL OR l.created_at <= p_created_to::TIMESTAMPTZ);

  -- Return paginated results
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
    l.sla_status,
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
    v_total AS total_count
  FROM leads l
  LEFT JOIN stages s ON s.id = l.stage_id
  LEFT JOIN users u ON u.id = l.assigned_user_id
  WHERE 
    (v_is_super_admin OR l.organization_id = v_org_id)
    AND (v_is_admin OR v_is_super_admin OR l.assigned_user_id = v_user_id)
    AND (p_search IS NULL OR (
      l.name ILIKE '%' || p_search || '%' 
      OR l.email ILIKE '%' || p_search || '%' 
      OR l.phone ILIKE '%' || p_search || '%'
    ))
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
      CASE p_sort_by
        WHEN 'created_at' THEN l.created_at
        WHEN 'last_interaction_at' THEN l.updated_at
        ELSE l.created_at
      END
    END DESC NULLS LAST,
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_by
        WHEN 'created_at' THEN l.created_at
        WHEN 'last_interaction_at' THEN l.updated_at
        ELSE l.created_at
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' AND p_sort_by = 'name' THEN l.name END DESC NULLS LAST,
    CASE WHEN p_sort_dir = 'asc' AND p_sort_by = 'name' THEN l.name END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' AND p_sort_by = 'stage' THEN s.name END DESC NULLS LAST,
    CASE WHEN p_sort_dir = 'asc' AND p_sort_by = 'stage' THEN s.name END ASC NULLS LAST,
    l.id
  LIMIT p_limit
  OFFSET v_offset;
END;
$$;