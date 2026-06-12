DROP FUNCTION IF EXISTS public.list_contacts_paginated(
  text, uuid, uuid, uuid, boolean, uuid, text, text, text, text, text, text, integer, integer
);

DROP FUNCTION IF EXISTS public.list_contacts_paginated(
  text, uuid, uuid, uuid, uuid, boolean, uuid, text, text, text, text, text, text, integer, integer
);

DROP FUNCTION IF EXISTS public.list_contacts_paginated(
  text, uuid, uuid, uuid, uuid, boolean, uuid, text, text, text, text, text, text, integer, integer, text, text, text
);

CREATE OR REPLACE FUNCTION public.list_contacts_paginated(
  p_search text DEFAULT NULL::text,
  p_team_id uuid DEFAULT NULL::uuid,
  p_pipeline_id uuid DEFAULT NULL::uuid,
  p_stage_id uuid DEFAULT NULL::uuid,
  p_assignee_id uuid DEFAULT NULL::uuid,
  p_unassigned boolean DEFAULT false,
  p_tag_id uuid DEFAULT NULL::uuid,
  p_source text DEFAULT NULL::text,
  p_deal_status text DEFAULT NULL::text,
  p_created_from text DEFAULT NULL::text,
  p_created_to text DEFAULT NULL::text,
  p_sort_by text DEFAULT 'created_at'::text,
  p_sort_dir text DEFAULT 'desc'::text,
  p_page integer DEFAULT 1,
  p_limit integer DEFAULT 25,
  p_campaign_id text DEFAULT NULL::text,
  p_adset_id text DEFAULT NULL::text,
  p_ad_id text DEFAULT NULL::text
)
RETURNS TABLE(
  id uuid,
  name text,
  phone text,
  email text,
  whatsapp_avatar_url text,
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
  lost_reason text,
  last_entry_at timestamptz,
  reentry_count integer,
  pipeline_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_user_role text;
  v_can_view_all boolean := false;
  v_can_view_team boolean := false;
  v_team_member_ids uuid[] := ARRAY[]::uuid[];
  v_filter_team_member_ids uuid[] := NULL;
  v_led_pipeline_ids uuid[] := ARRAY[]::uuid[];
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 10000);
  v_offset integer := 0;
  v_total bigint := 0;
BEGIN
  v_offset := (v_page - 1) * v_limit;

  SELECT u.organization_id, u.role
  INTO v_org_id, v_user_role
  FROM public.users u
  WHERE u.id = v_user_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  IF p_team_id IS NOT NULL THEN
    SELECT COALESCE(ARRAY(
      SELECT DISTINCT tm.user_id
      FROM public.team_members tm
      JOIN public.teams t ON t.id = tm.team_id
      WHERE tm.team_id = p_team_id
        AND t.organization_id = v_org_id
    ), ARRAY[]::uuid[])
    INTO v_filter_team_member_ids;
  END IF;

  IF v_user_role IN ('admin', 'super_admin') THEN
    v_can_view_all := true;
    v_can_view_team := true;
  ELSE
    SELECT
      EXISTS (
        SELECT 1
        FROM public.user_organization_roles uor
        JOIN public.organization_role_permissions orp
          ON orp.organization_role_id = uor.organization_role_id
        WHERE uor.user_id = v_user_id
          AND orp.permission_key = 'lead_view_all'
      ),
      EXISTS (
        SELECT 1
        FROM public.user_organization_roles uor
        JOIN public.organization_role_permissions orp
          ON orp.organization_role_id = uor.organization_role_id
        WHERE uor.user_id = v_user_id
          AND orp.permission_key = 'lead_view_team'
      )
    INTO v_can_view_all, v_can_view_team;
  END IF;

  IF v_can_view_team AND NOT v_can_view_all THEN
    SELECT COALESCE(
      ARRAY(
        SELECT DISTINCT tm.user_id
        FROM public.team_members tm
        WHERE tm.team_id IN (
          SELECT tm_self.team_id
          FROM public.team_members tm_self
          WHERE tm_self.user_id = v_user_id
        )
      ),
      ARRAY[]::uuid[]
    )
    INTO v_team_member_ids;

    SELECT COALESCE(
      ARRAY(SELECT public.get_user_led_pipeline_ids()),
      ARRAY[]::uuid[]
    )
    INTO v_led_pipeline_ids;

    IF NOT (v_user_id = ANY(v_team_member_ids)) THEN
      v_team_member_ids := array_append(v_team_member_ids, v_user_id);
    END IF;
  END IF;

  SELECT COUNT(*)
  INTO v_total
  FROM public.leads l
  WHERE l.organization_id = v_org_id
    AND (
      v_can_view_all
      OR (
        v_can_view_team
        AND (
          l.assigned_user_id = ANY(v_team_member_ids)
          OR l.pipeline_id = ANY(v_led_pipeline_ids)
        )
      )
      OR l.assigned_user_id = v_user_id
    )
    AND (p_team_id IS NULL OR l.assigned_user_id = ANY(v_filter_team_member_ids))
    AND (
      p_search IS NULL OR p_search = ''
      OR l.name ILIKE '%' || p_search || '%'
      OR l.phone ILIKE '%' || p_search || '%'
      OR l.email ILIKE '%' || p_search || '%'
    )
    AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id)
    AND (p_stage_id IS NULL OR l.stage_id = p_stage_id)
    AND (NOT p_unassigned OR l.assigned_user_id IS NULL)
    AND (p_unassigned OR p_assignee_id IS NULL OR l.assigned_user_id = p_assignee_id)
    AND (p_source IS NULL OR p_source = '' OR l.source = p_source)
    AND (p_deal_status IS NULL OR p_deal_status = '' OR l.deal_status = p_deal_status)
    AND (p_created_from IS NULL OR p_created_from = '' OR l.created_at >= p_created_from::timestamptz)
    AND (p_created_to IS NULL OR p_created_to = '' OR l.created_at < (p_created_to::date + interval '1 day'))
    AND (
      p_tag_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.lead_tags lt
        WHERE lt.lead_id = l.id
          AND lt.tag_id = p_tag_id
      )
    )
    AND (
      p_campaign_id IS NULL OR p_campaign_id = ''
      OR EXISTS (
        SELECT 1
        FROM public.lead_meta lm
        WHERE lm.lead_id = l.id
          AND (lm.campaign_id = p_campaign_id OR lm.campaign_name = p_campaign_id)
      )
    )
    AND (
      p_adset_id IS NULL OR p_adset_id = ''
      OR EXISTS (
        SELECT 1
        FROM public.lead_meta lm
        WHERE lm.lead_id = l.id
          AND (lm.adset_id = p_adset_id OR lm.adset_name = p_adset_id)
      )
    )
    AND (
      p_ad_id IS NULL OR p_ad_id = ''
      OR EXISTS (
        SELECT 1
        FROM public.lead_meta lm
        WHERE lm.lead_id = l.id
          AND (lm.ad_id = p_ad_id OR lm.ad_name = p_ad_id)
      )
    );

  RETURN QUERY
  SELECT
    l.id,
    l.name,
    l.phone,
    l.email,
    l.whatsapp_avatar_url,
    l.pipeline_id,
    l.stage_id,
    s.name AS stage_name,
    s.color AS stage_color,
    l.assigned_user_id,
    u.name AS assignee_name,
    u.avatar_url AS assignee_avatar,
    l.source,
    l.created_at,
    NULL::text AS sla_status,
    COALESCE(l.last_entry_at, l.created_at) AS last_interaction_at,
    NULL::text AS last_interaction_preview,
    NULL::text AS last_interaction_channel,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', t.id,
            'name', t.name,
            'color', t.color
          )
        )
        FROM public.lead_tags lt
        JOIN public.tags t ON t.id = lt.tag_id
        WHERE lt.lead_id = l.id
      ),
      '[]'::jsonb
    ) AS tags,
    v_total AS total_count,
    l.deal_status,
    l.lost_reason,
    l.last_entry_at,
    l.reentry_count,
    p.name AS pipeline_name
  FROM public.leads l
  LEFT JOIN public.stages s ON s.id = l.stage_id
  LEFT JOIN public.pipelines p ON p.id = l.pipeline_id
  LEFT JOIN public.users u ON u.id = l.assigned_user_id
  WHERE l.organization_id = v_org_id
    AND (
      v_can_view_all
      OR (
        v_can_view_team
        AND (
          l.assigned_user_id = ANY(v_team_member_ids)
          OR l.pipeline_id = ANY(v_led_pipeline_ids)
        )
      )
      OR l.assigned_user_id = v_user_id
    )
    AND (p_team_id IS NULL OR l.assigned_user_id = ANY(v_filter_team_member_ids))
    AND (
      p_search IS NULL OR p_search = ''
      OR l.name ILIKE '%' || p_search || '%'
      OR l.phone ILIKE '%' || p_search || '%'
      OR l.email ILIKE '%' || p_search || '%'
    )
    AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id)
    AND (p_stage_id IS NULL OR l.stage_id = p_stage_id)
    AND (NOT p_unassigned OR l.assigned_user_id IS NULL)
    AND (p_unassigned OR p_assignee_id IS NULL OR l.assigned_user_id = p_assignee_id)
    AND (p_source IS NULL OR p_source = '' OR l.source = p_source)
    AND (p_deal_status IS NULL OR p_deal_status = '' OR l.deal_status = p_deal_status)
    AND (p_created_from IS NULL OR p_created_from = '' OR l.created_at >= p_created_from::timestamptz)
    AND (p_created_to IS NULL OR p_created_to = '' OR l.created_at < (p_created_to::date + interval '1 day'))
    AND (
      p_tag_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.lead_tags lt
        WHERE lt.lead_id = l.id
          AND lt.tag_id = p_tag_id
      )
    )
    AND (
      p_campaign_id IS NULL OR p_campaign_id = ''
      OR EXISTS (
        SELECT 1
        FROM public.lead_meta lm
        WHERE lm.lead_id = l.id
          AND (lm.campaign_id = p_campaign_id OR lm.campaign_name = p_campaign_id)
      )
    )
    AND (
      p_adset_id IS NULL OR p_adset_id = ''
      OR EXISTS (
        SELECT 1
        FROM public.lead_meta lm
        WHERE lm.lead_id = l.id
          AND (lm.adset_id = p_adset_id OR lm.adset_name = p_adset_id)
      )
    )
    AND (
      p_ad_id IS NULL OR p_ad_id = ''
      OR EXISTS (
        SELECT 1
        FROM public.lead_meta lm
        WHERE lm.lead_id = l.id
          AND (lm.ad_id = p_ad_id OR lm.ad_name = p_ad_id)
      )
    )
  ORDER BY
    CASE WHEN p_sort_by = 'created_at' AND p_sort_dir = 'desc' THEN l.created_at END DESC,
    CASE WHEN p_sort_by = 'created_at' AND p_sort_dir = 'asc' THEN l.created_at END ASC,
    CASE WHEN p_sort_by = 'last_interaction_at' AND p_sort_dir = 'desc' THEN COALESCE(l.last_entry_at, l.created_at) END DESC,
    CASE WHEN p_sort_by = 'last_interaction_at' AND p_sort_dir = 'asc' THEN COALESCE(l.last_entry_at, l.created_at) END ASC,
    CASE WHEN p_sort_by = 'name' AND p_sort_dir = 'desc' THEN l.name END DESC,
    CASE WHEN p_sort_by = 'name' AND p_sort_dir = 'asc' THEN l.name END ASC,
    CASE WHEN p_sort_by = 'stage' AND p_sort_dir = 'desc' THEN s.position END DESC,
    CASE WHEN p_sort_by = 'stage' AND p_sort_dir = 'asc' THEN s.position END ASC,
    COALESCE(l.last_entry_at, l.created_at) DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.list_contacts_paginated(
  text, uuid, uuid, uuid, uuid, boolean, uuid, text, text, text, text, text, text, integer, integer, text, text, text
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.list_contacts_paginated(
  text, uuid, uuid, uuid, uuid, boolean, uuid, text, text, text, text, text, text, integer, integer, text, text, text
) FROM anon;

GRANT EXECUTE ON FUNCTION public.list_contacts_paginated(
  text, uuid, uuid, uuid, uuid, boolean, uuid, text, text, text, text, text, text, integer, integer, text, text, text
) TO authenticated;

NOTIFY pgrst, 'reload schema';
