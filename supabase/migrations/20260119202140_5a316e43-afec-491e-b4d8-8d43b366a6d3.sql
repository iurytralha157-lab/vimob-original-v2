-- Função para listar contatos com paginação e filtros
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
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_offset integer;
  v_total bigint;
BEGIN
  -- Obter organização do usuário
  SELECT organization_id INTO v_org_id FROM users WHERE users.id = auth.uid();
  
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;
  
  v_offset := (p_page - 1) * p_limit;
  
  -- Contar total
  SELECT COUNT(*) INTO v_total
  FROM leads l
  WHERE l.organization_id = v_org_id
    AND (p_search IS NULL OR 
         l.name ILIKE '%' || p_search || '%' OR 
         l.email ILIKE '%' || p_search || '%' OR 
         l.phone ILIKE '%' || p_search || '%')
    AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id)
    AND (p_stage_id IS NULL OR l.stage_id = p_stage_id)
    AND (
      (NOT p_unassigned AND (p_assignee_id IS NULL OR l.assigned_user_id = p_assignee_id))
      OR (p_unassigned AND l.assigned_user_id IS NULL)
    )
    AND (p_source IS NULL OR l.source = p_source)
    AND (p_created_from IS NULL OR l.created_at >= p_created_from)
    AND (p_created_to IS NULL OR l.created_at <= p_created_to)
    AND (p_tag_id IS NULL OR EXISTS (
      SELECT 1 FROM lead_tags lt WHERE lt.lead_id = l.id AND lt.tag_id = p_tag_id
    ));
  
  -- Retornar resultados
  RETURN QUERY
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
    l.source,
    l.created_at,
    NULL::text as sla_status,
    NULL::timestamptz as last_interaction_at,
    NULL::text as last_interaction_preview,
    NULL::text as last_interaction_channel,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color))
       FROM lead_tags lt
       JOIN tags t ON t.id = lt.tag_id
       WHERE lt.lead_id = l.id),
      '[]'::jsonb
    ) as tags,
    v_total as total_count
  FROM leads l
  LEFT JOIN stages s ON s.id = l.stage_id
  LEFT JOIN users u ON u.id = l.assigned_user_id
  WHERE l.organization_id = v_org_id
    AND (p_search IS NULL OR 
         l.name ILIKE '%' || p_search || '%' OR 
         l.email ILIKE '%' || p_search || '%' OR 
         l.phone ILIKE '%' || p_search || '%')
    AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id)
    AND (p_stage_id IS NULL OR l.stage_id = p_stage_id)
    AND (
      (NOT p_unassigned AND (p_assignee_id IS NULL OR l.assigned_user_id = p_assignee_id))
      OR (p_unassigned AND l.assigned_user_id IS NULL)
    )
    AND (p_source IS NULL OR l.source = p_source)
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
    CASE WHEN p_sort_by = 'stage' AND p_sort_dir = 'asc' THEN s.name END ASC,
    CASE WHEN p_sort_by = 'stage' AND p_sort_dir = 'desc' THEN s.name END DESC,
    l.created_at DESC
  LIMIT p_limit
  OFFSET v_offset;
END;
$$;