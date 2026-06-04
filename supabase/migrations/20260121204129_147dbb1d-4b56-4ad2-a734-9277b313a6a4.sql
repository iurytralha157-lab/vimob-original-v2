-- =====================================================
-- FIX: Broker data visibility - RPC list_contacts_paginated
-- Adds role-based filtering for non-admin users
-- =====================================================

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
  v_offset INT;
  v_total BIGINT;
BEGIN
  -- Get current user's organization and check admin status
  SELECT u.organization_id, u.id, (u.role = 'admin')
  INTO v_org_id, v_user_id, v_is_admin
  FROM users u
  WHERE u.id = auth.uid();

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  v_offset := (p_page - 1) * p_limit;

  -- Count total records with role-based visibility
  SELECT COUNT(*)
  INTO v_total
  FROM leads l
  LEFT JOIN lead_tags lt ON lt.lead_id = l.id
  WHERE l.organization_id = v_org_id
    -- Role-based visibility: admins see all, others see only their own
    AND (v_is_admin OR l.assigned_user_id = v_user_id)
    AND (p_search IS NULL OR (
      l.name ILIKE '%' || p_search || '%' 
      OR l.email ILIKE '%' || p_search || '%' 
      OR l.phone ILIKE '%' || p_search || '%'
    ))
    AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id)
    AND (p_stage_id IS NULL OR l.stage_id = p_stage_id)
    AND (NOT p_unassigned OR l.assigned_user_id IS NULL)
    AND (p_unassigned OR p_assignee_id IS NULL OR l.assigned_user_id = p_assignee_id)
    AND (p_tag_id IS NULL OR lt.tag_id = p_tag_id)
    AND (p_source IS NULL OR l.source::TEXT = p_source)
    AND (p_created_from IS NULL OR l.created_at >= p_created_from::TIMESTAMPTZ)
    AND (p_created_to IS NULL OR l.created_at <= p_created_to::TIMESTAMPTZ);

  -- Return paginated results with role-based visibility
  RETURN QUERY
  SELECT DISTINCT ON (
    CASE p_sort_by
      WHEN 'created_at' THEN l.created_at::TEXT
      WHEN 'name' THEN l.name
      WHEN 'last_interaction_at' THEN COALESCE(l.updated_at, l.created_at)::TEXT
      WHEN 'stage' THEN s.name
      ELSE l.created_at::TEXT
    END,
    l.id
  )
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
    COALESCE(
      (SELECT wm.created_at FROM whatsapp_messages wm 
       JOIN whatsapp_conversations wc ON wc.id = wm.conversation_id 
       WHERE wc.lead_id = l.id 
       ORDER BY wm.created_at DESC LIMIT 1),
      l.updated_at
    ) AS last_interaction_at,
    (SELECT LEFT(wm.body, 50) FROM whatsapp_messages wm 
     JOIN whatsapp_conversations wc ON wc.id = wm.conversation_id 
     WHERE wc.lead_id = l.id 
     ORDER BY wm.created_at DESC LIMIT 1) AS last_interaction_preview,
    (SELECT 
       CASE WHEN wm.from_me THEN 'whatsapp_sent' ELSE 'whatsapp_received' END
     FROM whatsapp_messages wm 
     JOIN whatsapp_conversations wc ON wc.id = wm.conversation_id 
     WHERE wc.lead_id = l.id 
     ORDER BY wm.created_at DESC LIMIT 1) AS last_interaction_channel,
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
  LEFT JOIN lead_tags lt ON lt.lead_id = l.id
  WHERE l.organization_id = v_org_id
    -- Role-based visibility: admins see all, others see only their own
    AND (v_is_admin OR l.assigned_user_id = v_user_id)
    AND (p_search IS NULL OR (
      l.name ILIKE '%' || p_search || '%' 
      OR l.email ILIKE '%' || p_search || '%' 
      OR l.phone ILIKE '%' || p_search || '%'
    ))
    AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id)
    AND (p_stage_id IS NULL OR l.stage_id = p_stage_id)
    AND (NOT p_unassigned OR l.assigned_user_id IS NULL)
    AND (p_unassigned OR p_assignee_id IS NULL OR l.assigned_user_id = p_assignee_id)
    AND (p_tag_id IS NULL OR lt.tag_id = p_tag_id)
    AND (p_source IS NULL OR l.source::TEXT = p_source)
    AND (p_created_from IS NULL OR l.created_at >= p_created_from::TIMESTAMPTZ)
    AND (p_created_to IS NULL OR l.created_at <= p_created_to::TIMESTAMPTZ)
  ORDER BY
    CASE p_sort_by
      WHEN 'created_at' THEN l.created_at::TEXT
      WHEN 'name' THEN l.name
      WHEN 'last_interaction_at' THEN COALESCE(l.updated_at, l.created_at)::TEXT
      WHEN 'stage' THEN s.name
      ELSE l.created_at::TEXT
    END,
    l.id,
    CASE WHEN p_sort_dir = 'desc' THEN 1 ELSE 0 END DESC
  LIMIT p_limit
  OFFSET v_offset;
END;
$$;

-- =====================================================
-- FIX: Funnel data RPC - Add role-based filtering
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_funnel_data()
RETURNS TABLE (
  name TEXT,
  value BIGINT,
  percentage NUMERIC,
  stage_key TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_is_admin BOOLEAN;
  v_total BIGINT;
BEGIN
  -- Get current user's organization and check admin status
  SELECT u.organization_id, u.id, (u.role = 'admin')
  INTO v_org_id, v_user_id, v_is_admin
  FROM users u
  WHERE u.id = auth.uid();

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  -- Count total leads with role-based visibility
  SELECT COUNT(*)
  INTO v_total
  FROM leads l
  WHERE l.organization_id = v_org_id
    AND (v_is_admin OR l.assigned_user_id = v_user_id);

  IF v_total = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    s.name,
    COUNT(l.id) AS value,
    ROUND((COUNT(l.id)::NUMERIC / v_total) * 100, 1) AS percentage,
    s.stage_key
  FROM stages s
  LEFT JOIN leads l ON l.stage_id = s.id 
    AND l.organization_id = v_org_id
    -- Role-based visibility
    AND (v_is_admin OR l.assigned_user_id = v_user_id)
  JOIN pipelines p ON p.id = s.pipeline_id
  WHERE p.organization_id = v_org_id
    AND p.is_default = true
  GROUP BY s.id, s.name, s.stage_key, s.position
  ORDER BY s.position;
END;
$$;

-- =====================================================
-- FIX: Lead sources data RPC - Add role-based filtering
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_lead_sources_data()
RETURNS TABLE (
  name TEXT,
  value BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- Get current user's organization and check admin status
  SELECT u.organization_id, u.id, (u.role = 'admin')
  INTO v_org_id, v_user_id, v_is_admin
  FROM users u
  WHERE u.id = auth.uid();

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    CASE l.source::TEXT
      WHEN 'meta' THEN 'Meta Ads'
      WHEN 'wordpress' THEN 'WordPress'
      WHEN 'site' THEN 'Site'
      WHEN 'whatsapp' THEN 'WhatsApp'
      WHEN 'indicacao' THEN 'Indicação'
      WHEN 'manual' THEN 'Manual'
      ELSE 'Outros'
    END AS name,
    COUNT(*) AS value
  FROM leads l
  WHERE l.organization_id = v_org_id
    -- Role-based visibility
    AND (v_is_admin OR l.assigned_user_id = v_user_id)
  GROUP BY l.source
  ORDER BY value DESC;
END;
$$;

-- =====================================================
-- FIX: Dashboard stats RPC - Add role-based filtering
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_is_admin BOOLEAN;
  v_result JSON;
  v_total_leads BIGINT;
  v_in_progress BIGINT;
  v_closed BIGINT;
  v_lost BIGINT;
  v_prev_total BIGINT;
  v_prev_closed BIGINT;
BEGIN
  -- Get current user's organization and check admin status
  SELECT u.organization_id, u.id, (u.role = 'admin')
  INTO v_org_id, v_user_id, v_is_admin
  FROM users u
  WHERE u.id = auth.uid();

  IF v_org_id IS NULL THEN
    RETURN json_build_object(
      'totalLeads', 0,
      'leadsInProgress', 0,
      'leadsClosed', 0,
      'leadsLost', 0,
      'leadsTrend', 0,
      'closedTrend', 0
    );
  END IF;

  -- Current period stats (last 30 days)
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE deal_status = 'open' OR deal_status IS NULL),
    COUNT(*) FILTER (WHERE deal_status = 'won'),
    COUNT(*) FILTER (WHERE deal_status = 'lost')
  INTO v_total_leads, v_in_progress, v_closed, v_lost
  FROM leads l
  WHERE l.organization_id = v_org_id
    AND (v_is_admin OR l.assigned_user_id = v_user_id)
    AND l.created_at >= NOW() - INTERVAL '30 days';

  -- Previous period stats (30-60 days ago)
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE deal_status = 'won')
  INTO v_prev_total, v_prev_closed
  FROM leads l
  WHERE l.organization_id = v_org_id
    AND (v_is_admin OR l.assigned_user_id = v_user_id)
    AND l.created_at >= NOW() - INTERVAL '60 days'
    AND l.created_at < NOW() - INTERVAL '30 days';

  v_result := json_build_object(
    'totalLeads', COALESCE(v_total_leads, 0),
    'leadsInProgress', COALESCE(v_in_progress, 0),
    'leadsClosed', COALESCE(v_closed, 0),
    'leadsLost', COALESCE(v_lost, 0),
    'leadsTrend', CASE WHEN v_prev_total > 0 THEN ROUND(((v_total_leads - v_prev_total)::NUMERIC / v_prev_total) * 100) ELSE 0 END,
    'closedTrend', CASE WHEN v_prev_closed > 0 THEN ROUND(((v_closed - v_prev_closed)::NUMERIC / v_prev_closed) * 100) ELSE 0 END
  );

  RETURN v_result;
END;
$$;