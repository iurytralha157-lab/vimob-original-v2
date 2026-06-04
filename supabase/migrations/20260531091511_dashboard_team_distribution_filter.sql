-- Dashboard team filtering by real distribution.
-- Prefer the round-robin member/team that actually received the lead.
-- For old/manual leads without team distribution logs, fallback to current assignee membership.

CREATE OR REPLACE FUNCTION public.get_dashboard_team_lead_ids(
  p_team_id uuid,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE(lead_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH current_org AS (
    SELECT public.get_user_organization_id() AS organization_id
  ),
  fallback_members AS (
    SELECT tm.user_id
    FROM public.team_members tm
    WHERE tm.team_id = p_team_id
  )
  SELECT DISTINCT l.id AS lead_id
  FROM public.leads l
  CROSS JOIN current_org co
  WHERE p_team_id IS NOT NULL
    AND l.organization_id = co.organization_id
    AND (p_date_from IS NULL OR l.created_at >= p_date_from)
    AND (p_date_to IS NULL OR l.created_at <= p_date_to)
    AND (
      EXISTS (
        SELECT 1
        FROM public.round_robin_logs rrl
        JOIN public.round_robin_members rrm ON rrm.id = rrl.member_id
        WHERE rrl.lead_id = l.id
          AND rrm.team_id = p_team_id
      )
      OR (
        NOT EXISTS (
          SELECT 1
          FROM public.round_robin_logs rrl
          JOIN public.round_robin_members rrm ON rrm.id = rrl.member_id
          WHERE rrl.lead_id = l.id
            AND rrm.team_id IS NOT NULL
        )
        AND l.assigned_user_id IN (SELECT user_id FROM fallback_members)
      )
    );
$$;

DROP FUNCTION IF EXISTS public.get_funnel_data(
  timestamptz, timestamptz, uuid, uuid, text, uuid, uuid, text
);

CREATE OR REPLACE FUNCTION public.get_funnel_data(
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_team_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_pipeline_id uuid DEFAULT NULL,
  p_tag_id uuid DEFAULT NULL,
  p_deal_status text DEFAULT NULL
)
RETURNS TABLE(
  stage_id uuid,
  stage_name text,
  stage_key text,
  stage_order int,
  lead_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_pipeline_id uuid;
  v_team_lead_ids uuid[];
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  IF p_pipeline_id IS NOT NULL THEN
    v_pipeline_id := p_pipeline_id;
  ELSE
    SELECT p.id INTO v_pipeline_id
    FROM public.pipelines p
    WHERE p.organization_id = v_org_id
    ORDER BY p.is_default DESC NULLS LAST, p.created_at ASC
    LIMIT 1;
  END IF;

  IF v_pipeline_id IS NULL THEN
    RETURN;
  END IF;

  IF p_team_id IS NOT NULL THEN
    SELECT array_agg(ids.lead_id) INTO v_team_lead_ids
    FROM public.get_dashboard_team_lead_ids(p_team_id, p_date_from, p_date_to) ids;

    IF v_team_lead_ids IS NULL OR array_length(v_team_lead_ids, 1) IS NULL THEN
      v_team_lead_ids := ARRAY[]::uuid[];
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    s.id AS stage_id,
    s.name AS stage_name,
    COALESCE(s.stage_key, s.name) AS stage_key,
    s.position AS stage_order,
    COUNT(l.id) AS lead_count
  FROM public.stages s
  LEFT JOIN public.leads l ON l.stage_id = s.id
    AND l.organization_id = v_org_id
    AND (p_date_from IS NULL OR l.created_at >= p_date_from)
    AND (p_date_to IS NULL OR l.created_at <= p_date_to)
    AND (p_team_id IS NULL OR l.id = ANY(v_team_lead_ids))
    AND (p_user_id IS NULL OR l.assigned_user_id = p_user_id)
    AND (p_source IS NULL OR p_source = 'all' OR l.source::text = p_source)
    AND (p_deal_status IS NULL OR p_deal_status = '' OR l.deal_status = p_deal_status)
    AND (p_tag_id IS NULL OR EXISTS (
      SELECT 1 FROM public.lead_tags lt WHERE lt.lead_id = l.id AND lt.tag_id = p_tag_id
    ))
  WHERE s.pipeline_id = v_pipeline_id
  GROUP BY s.id, s.name, s.stage_key, s.position
  ORDER BY s.position;
END;
$$;

DROP FUNCTION IF EXISTS public.get_lead_sources_data(
  timestamptz, timestamptz, uuid, uuid, text, uuid, uuid, text
);

CREATE OR REPLACE FUNCTION public.get_lead_sources_data(
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_team_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_pipeline_id uuid DEFAULT NULL,
  p_tag_id uuid DEFAULT NULL,
  p_deal_status text DEFAULT NULL
)
RETURNS TABLE(
  source_name text,
  lead_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_team_lead_ids uuid[];
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  IF p_team_id IS NOT NULL THEN
    SELECT array_agg(ids.lead_id) INTO v_team_lead_ids
    FROM public.get_dashboard_team_lead_ids(p_team_id, p_date_from, p_date_to) ids;

    IF v_team_lead_ids IS NULL OR array_length(v_team_lead_ids, 1) IS NULL THEN
      v_team_lead_ids := ARRAY[]::uuid[];
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(l.source::text, 'manual') AS source_name,
    COUNT(*) AS lead_count
  FROM public.leads l
  WHERE l.organization_id = v_org_id
    AND (p_pipeline_id IS NULL OR l.stage_id IN (
      SELECT s.id FROM public.stages s WHERE s.pipeline_id = p_pipeline_id
    ))
    AND (p_date_from IS NULL OR l.created_at >= p_date_from)
    AND (p_date_to IS NULL OR l.created_at <= p_date_to)
    AND (p_team_id IS NULL OR l.id = ANY(v_team_lead_ids))
    AND (p_user_id IS NULL OR l.assigned_user_id = p_user_id)
    AND (p_source IS NULL OR p_source = 'all' OR l.source::text = p_source)
    AND (p_deal_status IS NULL OR p_deal_status = '' OR l.deal_status = p_deal_status)
    AND (p_tag_id IS NULL OR EXISTS (
      SELECT 1 FROM public.lead_tags lt WHERE lt.lead_id = l.id AND lt.tag_id = p_tag_id
    ))
  GROUP BY l.source
  ORDER BY lead_count DESC;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_round_robin_logs_lead_member
  ON public.round_robin_logs(lead_id, member_id);
