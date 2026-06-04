-- Index for WhatsApp conversations by lead (last interaction)
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_lead_last_msg 
ON public.whatsapp_conversations(lead_id, last_message_at DESC);

-- Index for activities by lead (last interaction)
CREATE INDEX IF NOT EXISTS idx_activities_lead_created 
ON public.activities(lead_id, created_at DESC);

-- RPC: list_contacts_paginated
-- Server-side paginated listing with all filters, last_interaction, and RLS
CREATE OR REPLACE FUNCTION public.list_contacts_paginated(
  p_search text DEFAULT NULL,
  p_pipeline_id uuid DEFAULT NULL,
  p_stage_id uuid DEFAULT NULL,
  p_assignee_id uuid DEFAULT NULL,
  p_unassigned boolean DEFAULT false,
  p_tag_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_created_from timestamptz DEFAULT NULL,
  p_created_to timestamptz DEFAULT NULL,
  p_sort_by text DEFAULT 'created_at',
  p_sort_dir text DEFAULT 'desc',
  p_page int DEFAULT 1,
  p_limit int DEFAULT 25
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
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_org_id uuid;
  v_offset int;
  v_order_clause text;
BEGIN
  -- Get org from RLS context
  v_org_id := public.auth_org_id();
  
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Calculate offset
  v_offset := (GREATEST(p_page, 1) - 1) * p_limit;
  
  -- Build order clause (prevent SQL injection)
  v_order_clause := CASE p_sort_by
    WHEN 'name' THEN 'l.name'
    WHEN 'last_interaction_at' THEN 'li.last_interaction_at'
    WHEN 'stage' THEN 's.position'
    ELSE 'l.created_at'
  END;
  
  IF LOWER(p_sort_dir) = 'asc' THEN
    v_order_clause := v_order_clause || ' ASC NULLS LAST';
  ELSE
    v_order_clause := v_order_clause || ' DESC NULLS LAST';
  END IF;
  
  RETURN QUERY EXECUTE format('
    WITH lead_tags_agg AS (
      SELECT 
        lt.lead_id,
        jsonb_agg(
          jsonb_build_object(
            ''id'', t.id,
            ''name'', t.name,
            ''color'', t.color
          ) ORDER BY t.name
        ) FILTER (WHERE t.id IS NOT NULL) as tags
      FROM lead_tags lt
      JOIN tags t ON t.id = lt.tag_id
      GROUP BY lt.lead_id
    ),
    last_interactions AS (
      SELECT DISTINCT ON (lead_id)
        lead_id,
        interaction_at,
        preview,
        channel
      FROM (
        -- Activities
        SELECT 
          a.lead_id,
          a.created_at as interaction_at,
          LEFT(a.content, 100) as preview,
          ''activity'' as channel
        FROM activities a
        WHERE a.lead_id IS NOT NULL
        
        UNION ALL
        
        -- WhatsApp conversations
        SELECT 
          wc.lead_id,
          wc.last_message_at as interaction_at,
          LEFT(wc.last_message, 100) as preview,
          ''whatsapp'' as channel
        FROM whatsapp_conversations wc
        WHERE wc.lead_id IS NOT NULL AND wc.last_message_at IS NOT NULL
      ) interactions
      ORDER BY lead_id, interaction_at DESC
    ),
    filtered_leads AS (
      SELECT l.*
      FROM leads l
      WHERE l.organization_id = %L
        AND (%L IS NULL OR (
          l.name ILIKE ''%%'' || %L || ''%%''
          OR l.email ILIKE ''%%'' || %L || ''%%''
          OR l.phone ILIKE ''%%'' || %L || ''%%''
        ))
        AND (%L::uuid IS NULL OR l.pipeline_id = %L)
        AND (%L::uuid IS NULL OR l.stage_id = %L)
        AND (NOT %L OR l.assigned_user_id IS NULL)
        AND (%L::uuid IS NULL OR l.assigned_user_id = %L)
        AND (%L IS NULL OR l.source::text = %L)
        AND (%L::timestamptz IS NULL OR l.created_at >= %L)
        AND (%L::timestamptz IS NULL OR l.created_at <= %L)
        AND (%L::uuid IS NULL OR EXISTS (
          SELECT 1 FROM lead_tags lt WHERE lt.lead_id = l.id AND lt.tag_id = %L
        ))
    ),
    total AS (
      SELECT COUNT(*) as cnt FROM filtered_leads
    )
    SELECT 
      l.id,
      l.name,
      l.phone,
      l.email,
      l.pipeline_id,
      l.stage_id,
      s.name as stage_name,
      s.color as stage_color,
      l.assigned_user_id,
      u.name as assignee_name,
      u.avatar_url as assignee_avatar,
      l.source::text,
      l.created_at,
      l.sla_status,
      li.interaction_at as last_interaction_at,
      li.preview as last_interaction_preview,
      li.channel as last_interaction_channel,
      COALESCE(lta.tags, ''[]''::jsonb) as tags,
      t.cnt as total_count
    FROM filtered_leads l
    CROSS JOIN total t
    LEFT JOIN stages s ON s.id = l.stage_id
    LEFT JOIN users u ON u.id = l.assigned_user_id
    LEFT JOIN lead_tags_agg lta ON lta.lead_id = l.id
    LEFT JOIN last_interactions li ON li.lead_id = l.id
    ORDER BY %s
    LIMIT %L OFFSET %L
  ',
    v_org_id,
    p_search, p_search, p_search, p_search,
    p_pipeline_id, p_pipeline_id,
    p_stage_id, p_stage_id,
    p_unassigned,
    CASE WHEN p_unassigned THEN NULL ELSE p_assignee_id END, 
    CASE WHEN p_unassigned THEN NULL ELSE p_assignee_id END,
    p_source, p_source,
    p_created_from, p_created_from,
    p_created_to, p_created_to,
    p_tag_id, p_tag_id,
    v_order_clause,
    p_limit, v_offset
  );
END;
$$;