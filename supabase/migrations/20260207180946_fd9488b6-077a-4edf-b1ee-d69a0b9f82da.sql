-- Corrigir função list_contacts_paginated para usar a tabela pivô user_organization_roles
-- O erro anterior: tentava acessar u.organization_role_id que NÃO existe na tabela users
-- Solução: usar a tabela pivô user_organization_roles como em user_has_permission()

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
  v_org_id uuid;
  v_user_id uuid;
  v_user_role text;
  v_is_super_admin boolean;
  v_has_view_all boolean := false;
  v_has_view_team boolean := false;
  v_team_user_ids uuid[];
  v_offset integer;
  v_total bigint;
BEGIN
  -- Pegar usuário atual e organização
  v_user_id := auth.uid();
  
  SELECT organization_id, role INTO v_org_id, v_user_role
  FROM users
  WHERE users.id = v_user_id;
  
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Verificar se é super_admin
  v_is_super_admin := (v_user_role = 'super_admin');
  
  -- Admin e super_admin veem tudo
  IF v_user_role IN ('admin', 'super_admin') THEN
    v_has_view_all := true;
  ELSE
    -- CORREÇÃO: Usar tabela pivô user_organization_roles (não users.organization_role_id)
    SELECT 
      COALESCE(bool_or(orp.permission_key = 'lead_view_all'), FALSE),
      COALESCE(bool_or(orp.permission_key = 'lead_view_team'), FALSE)
    INTO v_has_view_all, v_has_view_team
    FROM user_organization_roles uor
    JOIN organization_role_permissions orp ON orp.organization_role_id = uor.organization_role_id
    WHERE uor.user_id = v_user_id;
  END IF;
  
  -- Se tem view_team, pegar IDs dos membros das equipes que lidera
  IF v_has_view_team AND NOT v_has_view_all THEN
    SELECT ARRAY_AGG(DISTINCT tm.user_id)
    INTO v_team_user_ids
    FROM teams t
    JOIN team_members tm ON tm.team_id = t.id
    WHERE t.leader_id = v_user_id
       OR t.id IN (SELECT team_id FROM team_members WHERE user_id = v_user_id);
    
    -- Incluir o próprio usuário
    IF v_team_user_ids IS NULL THEN
      v_team_user_ids := ARRAY[v_user_id];
    ELSE
      v_team_user_ids := array_append(v_team_user_ids, v_user_id);
    END IF;
  END IF;
  
  v_offset := (p_page - 1) * p_limit;
  
  -- Contar total
  SELECT COUNT(*)
  INTO v_total
  FROM leads l
  WHERE l.organization_id = v_org_id
    -- Filtro de visibilidade RBAC
    AND (
      v_has_view_all
      OR (v_has_view_team AND l.assigned_user_id = ANY(v_team_user_ids))
      OR (NOT v_has_view_all AND NOT v_has_view_team AND l.assigned_user_id = v_user_id)
    )
    -- Filtros opcionais
    AND (p_search IS NULL OR (
      l.name ILIKE '%' || p_search || '%'
      OR l.phone ILIKE '%' || p_search || '%'
      OR l.email ILIKE '%' || p_search || '%'
    ))
    AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id)
    AND (p_stage_id IS NULL OR l.stage_id = p_stage_id)
    AND (p_assignee_id IS NULL OR l.assigned_user_id = p_assignee_id)
    AND (NOT p_unassigned OR l.assigned_user_id IS NULL)
    AND (p_source IS NULL OR l.source = p_source)
    AND (p_deal_status IS NULL OR l.deal_status = p_deal_status)
    AND (p_created_from IS NULL OR l.created_at >= p_created_from::timestamptz)
    AND (p_created_to IS NULL OR l.created_at <= (p_created_to::date + interval '1 day'))
    AND (p_tag_id IS NULL OR EXISTS (
      SELECT 1 FROM lead_tags lt WHERE lt.lead_id = l.id AND lt.tag_id = p_tag_id
    ));
  
  -- Retornar dados
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
  LEFT JOIN pipeline_stages s ON s.id = l.stage_id
  LEFT JOIN users u ON u.id = l.assigned_user_id
  WHERE l.organization_id = v_org_id
    -- Filtro de visibilidade RBAC
    AND (
      v_has_view_all
      OR (v_has_view_team AND l.assigned_user_id = ANY(v_team_user_ids))
      OR (NOT v_has_view_all AND NOT v_has_view_team AND l.assigned_user_id = v_user_id)
    )
    -- Filtros opcionais
    AND (p_search IS NULL OR (
      l.name ILIKE '%' || p_search || '%'
      OR l.phone ILIKE '%' || p_search || '%'
      OR l.email ILIKE '%' || p_search || '%'
    ))
    AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id)
    AND (p_stage_id IS NULL OR l.stage_id = p_stage_id)
    AND (p_assignee_id IS NULL OR l.assigned_user_id = p_assignee_id)
    AND (NOT p_unassigned OR l.assigned_user_id IS NULL)
    AND (p_source IS NULL OR l.source = p_source)
    AND (p_deal_status IS NULL OR l.deal_status = p_deal_status)
    AND (p_created_from IS NULL OR l.created_at >= p_created_from::timestamptz)
    AND (p_created_to IS NULL OR l.created_at <= (p_created_to::date + interval '1 day'))
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