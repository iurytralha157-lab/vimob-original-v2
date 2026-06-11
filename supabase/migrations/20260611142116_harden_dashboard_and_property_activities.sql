-- Harden dashboard RPCs and support organization-scoped activities without fake leads.

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.activities AS a
SET organization_id = l.organization_id
FROM public.leads AS l
WHERE a.lead_id = l.id
  AND a.organization_id IS NULL;

ALTER TABLE public.activities
  ALTER COLUMN lead_id DROP NOT NULL;

ALTER TABLE public.activities
  DROP CONSTRAINT IF EXISTS activities_lead_or_org_check;

ALTER TABLE public.activities
  ADD CONSTRAINT activities_lead_or_org_check
  CHECK (lead_id IS NOT NULL OR organization_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_activities_organization_type_created
  ON public.activities (organization_id, type, created_at DESC)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activities_property_created_metadata
  ON public.activities ((metadata->>'property_id'), created_at DESC)
  WHERE type = 'property_created' AND metadata ? 'property_id';

DROP POLICY IF EXISTS "Users can view org activities" ON public.activities;
DROP POLICY IF EXISTS "Users can create activities" ON public.activities;

CREATE POLICY "Users can view org activities"
ON public.activities
FOR SELECT
USING (
  public.is_super_admin()
  OR organization_id = public.get_user_organization_id()
  OR (
    lead_id IS NOT NULL
    AND public.can_access_lead(lead_id, auth.uid())
  )
);

CREATE POLICY "Users can create activities"
ON public.activities
FOR INSERT
WITH CHECK (
  public.is_super_admin()
  OR (
    lead_id IS NOT NULL
    AND public.can_access_lead(lead_id, auth.uid())
    AND (
      organization_id IS NULL
      OR organization_id = public.get_user_organization_id()
    )
  )
  OR (
    lead_id IS NULL
    AND organization_id = public.get_user_organization_id()
  )
);

CREATE OR REPLACE FUNCTION public.handle_activity_gamification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_org_id uuid;
  v_points integer := 0;
  v_should_award boolean := true;
  v_activity_date date;
BEGIN
  SELECT COALESCE(NEW.organization_id, u.organization_id)
    INTO v_org_id
  FROM public.users u
  WHERE u.id = NEW.user_id;

  v_org_id := COALESCE(v_org_id, NEW.organization_id);

  IF NEW.user_id IS NULL OR v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_activity_date := (NEW.created_at AT TIME ZONE 'America/Sao_Paulo')::date;

  CASE NEW.type
    WHEN 'call' THEN v_points := 10;
    WHEN 'whatsapp', 'email' THEN v_points := 5;
    WHEN 'meeting', 'visit' THEN v_points := 15;
    WHEN 'proposal' THEN v_points := 20;
    WHEN 'lead_created' THEN v_points := 8;
    WHEN 'property_created' THEN v_points := 12;
    ELSE v_points := 0;
  END CASE;

  IF v_points <= 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.metadata ? 'gamification_awarded' AND (NEW.metadata->>'gamification_awarded')::boolean = false THEN
    v_should_award := false;
  END IF;

  IF NOT v_should_award THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_gamification_stats (
    user_id,
    organization_id,
    total_points,
    level,
    activities_count,
    last_activity_date
  )
  VALUES (
    NEW.user_id,
    v_org_id,
    v_points,
    1,
    1,
    v_activity_date
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    total_points = public.user_gamification_stats.total_points + EXCLUDED.total_points,
    level = GREATEST(1, FLOOR((public.user_gamification_stats.total_points + EXCLUDED.total_points) / 100) + 1),
    activities_count = public.user_gamification_stats.activities_count + 1,
    last_activity_date = GREATEST(public.user_gamification_stats.last_activity_date, EXCLUDED.last_activity_date),
    updated_at = now();

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.count_unique_sessions(
  p_organization_id uuid,
  p_date_from timestamp with time zone,
  p_date_to timestamp with time zone
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_org_id uuid;
  v_count bigint;
BEGIN
  v_user_org_id := public.get_user_organization_id();

  IF NOT public.is_super_admin()
     AND (v_user_org_id IS NULL OR p_organization_id IS DISTINCT FROM v_user_org_id) THEN
    RAISE EXCEPTION 'Not allowed to count sessions for this organization' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(DISTINCT le.session_id)::bigint
    INTO v_count
  FROM public.lead_events le
  WHERE le.organization_id = p_organization_id
    AND le.session_id IS NOT NULL
    AND le.created_at >= p_date_from
    AND le.created_at <= p_date_to;

  RETURN COALESCE(v_count, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_dashboard_team_lead_ids(
  p_team_id uuid,
  p_date_from timestamp with time zone DEFAULT NULL,
  p_date_to timestamp with time zone DEFAULT NULL
)
RETURNS TABLE(lead_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller_id uuid := auth.uid();
  v_org_id uuid := public.get_user_organization_id();
  v_can_view_all boolean := false;
  v_can_view_team boolean := false;
  v_team_allowed boolean := false;
  v_visible_user_ids uuid[] := ARRAY[]::uuid[];
  v_visible_pipeline_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_caller_id IS NULL OR p_team_id IS NULL THEN
    RETURN;
  END IF;

  v_can_view_all := public.is_super_admin()
    OR public.is_admin()
    OR public.user_has_permission('lead_view_all', v_caller_id)
    OR public.user_has_permission('lead_edit_all', v_caller_id);

  v_can_view_team := public.user_has_permission('lead_view_team', v_caller_id)
    OR public.user_has_permission('lead_edit_team', v_caller_id);

  IF v_can_view_all THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.teams t
      WHERE t.id = p_team_id
        AND (public.is_super_admin() OR t.organization_id = v_org_id)
    )
    INTO v_team_allowed;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.team_id = p_team_id
        AND tm.user_id = v_caller_id
        AND (tm.is_leader OR v_can_view_team)
    )
    OR p_team_id IN (SELECT led_team_id FROM public.get_user_led_team_ids() AS led_team_id)
    INTO v_team_allowed;
  END IF;

  IF NOT v_team_allowed THEN
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT tm.user_id), ARRAY[]::uuid[])
    INTO v_visible_user_ids
  FROM public.team_members tm
  WHERE tm.team_id IN (
    SELECT p_team_id
    UNION
    SELECT led_team_id FROM public.get_user_led_team_ids() AS led_team_id
    UNION
    SELECT own_tm.team_id
    FROM public.team_members own_tm
    WHERE own_tm.user_id = v_caller_id
      AND v_can_view_team
  );

  v_visible_user_ids := array_append(v_visible_user_ids, v_caller_id);

  SELECT COALESCE(array_agg(DISTINCT pipeline_id), ARRAY[]::uuid[])
    INTO v_visible_pipeline_ids
  FROM public.get_user_led_pipeline_ids() AS p(pipeline_id);

  RETURN QUERY
  WITH fallback_members AS (
    SELECT tm.user_id
    FROM public.team_members tm
    WHERE tm.team_id = p_team_id
  )
  SELECT DISTINCT l.id AS lead_id
  FROM public.leads l
  WHERE (public.is_super_admin() OR l.organization_id = v_org_id)
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
    )
    AND (
      v_can_view_all
      OR l.assigned_user_id = ANY(v_visible_user_ids)
      OR l.pipeline_id = ANY(v_visible_pipeline_ids)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_funnel_data(
  p_date_from timestamp with time zone DEFAULT NULL,
  p_date_to timestamp with time zone DEFAULT NULL,
  p_team_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_pipeline_id uuid DEFAULT NULL,
  p_tag_id uuid DEFAULT NULL,
  p_deal_status text DEFAULT NULL
)
RETURNS TABLE(stage_id uuid, stage_name text, stage_key text, stage_order integer, lead_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller_id uuid := auth.uid();
  v_org_id uuid := public.get_user_organization_id();
  v_pipeline_id uuid;
  v_can_view_all boolean := false;
  v_can_view_team boolean := false;
  v_visible_user_ids uuid[] := ARRAY[]::uuid[];
  v_visible_pipeline_ids uuid[] := ARRAY[]::uuid[];
  v_pipeline_allowed boolean := false;
  v_user_allowed boolean := false;
  v_team_lead_ids uuid[] := NULL;
BEGIN
  IF v_org_id IS NULL AND NOT public.is_super_admin() THEN
    RETURN;
  END IF;

  v_can_view_all := public.is_super_admin()
    OR public.is_admin()
    OR public.user_has_permission('lead_view_all', v_caller_id)
    OR public.user_has_permission('lead_edit_all', v_caller_id);

  v_can_view_team := public.user_has_permission('lead_view_team', v_caller_id)
    OR public.user_has_permission('lead_edit_team', v_caller_id);

  SELECT COALESCE(array_agg(DISTINCT tm.user_id), ARRAY[]::uuid[])
    INTO v_visible_user_ids
  FROM public.team_members tm
  WHERE tm.team_id IN (
      SELECT led_team_id FROM public.get_user_led_team_ids() AS led_team_id
      UNION
      SELECT own_tm.team_id
      FROM public.team_members own_tm
      WHERE own_tm.user_id = v_caller_id
        AND v_can_view_team
    );

  v_visible_user_ids := array_append(v_visible_user_ids, v_caller_id);

  SELECT COALESCE(array_agg(DISTINCT pipeline_id), ARRAY[]::uuid[])
    INTO v_visible_pipeline_ids
  FROM public.get_user_led_pipeline_ids() AS p(pipeline_id);

  IF p_pipeline_id IS NOT NULL THEN
    SELECT p.id INTO v_pipeline_id
    FROM public.pipelines p
    WHERE p.id = p_pipeline_id
      AND (public.is_super_admin() OR p.organization_id = v_org_id);

    IF v_pipeline_id IS NULL THEN
      RETURN;
    END IF;
  ELSE
    SELECT p.id INTO v_pipeline_id
    FROM public.pipelines p
    WHERE (public.is_super_admin() OR p.organization_id = v_org_id)
    ORDER BY p.is_default DESC NULLS LAST, p.created_at ASC
    LIMIT 1;
  END IF;

  IF v_pipeline_id IS NULL THEN
    RETURN;
  END IF;

  IF p_user_id IS NOT NULL THEN
    v_user_allowed := v_can_view_all
      OR p_user_id = v_caller_id
      OR p_user_id = ANY(v_visible_user_ids);

    IF NOT v_user_allowed THEN
      RETURN;
    END IF;
  END IF;

  IF p_team_id IS NOT NULL THEN
    SELECT array_agg(ids.lead_id)
      INTO v_team_lead_ids
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
    AND (public.is_super_admin() OR l.organization_id = v_org_id)
    AND (p_date_from IS NULL OR l.created_at >= p_date_from)
    AND (p_date_to IS NULL OR l.created_at <= p_date_to)
    AND (p_team_id IS NULL OR l.id = ANY(v_team_lead_ids))
    AND (p_user_id IS NULL OR l.assigned_user_id = p_user_id)
    AND (p_source IS NULL OR p_source = 'all' OR l.source::text = p_source)
    AND (p_deal_status IS NULL OR p_deal_status = '' OR l.deal_status = p_deal_status)
    AND (p_tag_id IS NULL OR EXISTS (
      SELECT 1 FROM public.lead_tags lt WHERE lt.lead_id = l.id AND lt.tag_id = p_tag_id
    ))
    AND (
      v_can_view_all
      OR l.assigned_user_id = ANY(v_visible_user_ids)
      OR l.pipeline_id = ANY(v_visible_pipeline_ids)
    )
  WHERE s.pipeline_id = v_pipeline_id
  GROUP BY s.id, s.name, s.stage_key, s.position
  ORDER BY s.position;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_lead_sources_data(
  p_date_from timestamp with time zone DEFAULT NULL,
  p_date_to timestamp with time zone DEFAULT NULL,
  p_team_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_pipeline_id uuid DEFAULT NULL,
  p_tag_id uuid DEFAULT NULL,
  p_deal_status text DEFAULT NULL
)
RETURNS TABLE(source_name text, lead_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller_id uuid := auth.uid();
  v_org_id uuid := public.get_user_organization_id();
  v_can_view_all boolean := false;
  v_can_view_team boolean := false;
  v_visible_user_ids uuid[] := ARRAY[]::uuid[];
  v_visible_pipeline_ids uuid[] := ARRAY[]::uuid[];
  v_pipeline_allowed boolean := false;
  v_user_allowed boolean := false;
  v_team_lead_ids uuid[] := NULL;
BEGIN
  IF v_org_id IS NULL AND NOT public.is_super_admin() THEN
    RETURN;
  END IF;

  v_can_view_all := public.is_super_admin()
    OR public.is_admin()
    OR public.user_has_permission('lead_view_all', v_caller_id)
    OR public.user_has_permission('lead_edit_all', v_caller_id);

  v_can_view_team := public.user_has_permission('lead_view_team', v_caller_id)
    OR public.user_has_permission('lead_edit_team', v_caller_id);

  SELECT COALESCE(array_agg(DISTINCT tm.user_id), ARRAY[]::uuid[])
    INTO v_visible_user_ids
  FROM public.team_members tm
  WHERE tm.team_id IN (
      SELECT led_team_id FROM public.get_user_led_team_ids() AS led_team_id
      UNION
      SELECT own_tm.team_id
      FROM public.team_members own_tm
      WHERE own_tm.user_id = v_caller_id
        AND v_can_view_team
    );

  v_visible_user_ids := array_append(v_visible_user_ids, v_caller_id);

  SELECT COALESCE(array_agg(DISTINCT pipeline_id), ARRAY[]::uuid[])
    INTO v_visible_pipeline_ids
  FROM public.get_user_led_pipeline_ids() AS p(pipeline_id);

  IF p_pipeline_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.pipelines p
      WHERE p.id = p_pipeline_id
        AND (public.is_super_admin() OR p.organization_id = v_org_id)
    )
    INTO v_pipeline_allowed;

    IF NOT v_pipeline_allowed THEN
      RETURN;
    END IF;
  END IF;

  IF p_user_id IS NOT NULL THEN
    v_user_allowed := v_can_view_all
      OR p_user_id = v_caller_id
      OR p_user_id = ANY(v_visible_user_ids);

    IF NOT v_user_allowed THEN
      RETURN;
    END IF;
  END IF;

  IF p_team_id IS NOT NULL THEN
    SELECT array_agg(ids.lead_id)
      INTO v_team_lead_ids
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
  WHERE (public.is_super_admin() OR l.organization_id = v_org_id)
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
    AND (
      v_can_view_all
      OR l.assigned_user_id = ANY(v_visible_user_ids)
      OR l.pipeline_id = ANY(v_visible_pipeline_ids)
    )
  GROUP BY l.source
  ORDER BY lead_count DESC;
END;
$function$;
