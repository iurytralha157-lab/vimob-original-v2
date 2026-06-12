-- Harden pipeline SLA runtime support for the existing live schema.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sla_status text,
  ADD COLUMN IF NOT EXISTS sla_seconds_elapsed integer,
  ADD COLUMN IF NOT EXISTS sla_last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_notified_warning_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_notified_overdue_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_sla_pending_check
  ON public.leads (pipeline_id, first_response_at, sla_last_checked_at)
  WHERE first_response_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_sla_status
  ON public.leads (sla_status)
  WHERE sla_status IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_sla_start_at(p_lead_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    CASE COALESCE(ps.sla_start_field, p.first_response_start, 'created_at')
      WHEN 'stage_entered_at' THEN l.stage_entered_at
      WHEN 'stage_entered' THEN l.stage_entered_at
      WHEN 'assigned_at' THEN l.assigned_at
      WHEN 'lead_assigned' THEN l.assigned_at
      ELSE l.created_at
    END,
    l.stage_entered_at,
    l.assigned_at,
    l.created_at
  )
  FROM public.leads l
  LEFT JOIN public.pipelines p ON p.id = l.pipeline_id
  LEFT JOIN public.pipeline_sla_settings ps
    ON ps.pipeline_id = l.pipeline_id
   AND (ps.stage_id = l.stage_id OR ps.stage_id IS NULL)
  WHERE l.id = p_lead_id
  ORDER BY ps.stage_id NULLS LAST
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_sla_pending_leads()
RETURNS TABLE (
  lead_id uuid,
  lead_name text,
  pipeline_id uuid,
  stage_id uuid,
  assigned_user_id uuid,
  organization_id uuid,
  created_at timestamptz,
  sla_start_at timestamptz,
  warning_after_seconds integer,
  overdue_after_seconds integer,
  seconds_elapsed integer,
  current_sla_status text,
  last_checked_at timestamptz,
  notified_warning_at timestamptz,
  notified_overdue_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH selected_settings AS (
    SELECT DISTINCT ON (l.id)
      l.id AS lead_id,
      ps.warning_hours,
      ps.critical_hours,
      public.get_sla_start_at(l.id) AS sla_start_at
    FROM public.leads l
    JOIN public.pipeline_sla_settings ps
      ON ps.pipeline_id = l.pipeline_id
     AND (ps.stage_id = l.stage_id OR ps.stage_id IS NULL)
    WHERE l.first_response_at IS NULL
      AND l.pipeline_id IS NOT NULL
      AND COALESCE(l.deal_status, '') NOT IN ('won', 'lost', 'closed')
    ORDER BY l.id, ps.stage_id NULLS LAST
  )
  SELECT
    l.id,
    COALESCE(l.name, l.full_name, l.client_name, 'Lead')::text,
    l.pipeline_id,
    l.stage_id,
    l.assigned_user_id,
    l.organization_id,
    l.created_at,
    ss.sla_start_at,
    GREATEST(COALESCE(ss.warning_hours, 24), 1)::integer * 3600,
    GREATEST(COALESCE(ss.critical_hours, 48), 1)::integer * 3600,
    GREATEST(EXTRACT(EPOCH FROM (now() - ss.sla_start_at))::integer, 0),
    l.sla_status,
    l.sla_last_checked_at,
    l.sla_notified_warning_at,
    l.sla_notified_overdue_at
  FROM public.leads l
  JOIN selected_settings ss ON ss.lead_id = l.id
  WHERE ss.sla_start_at IS NOT NULL
    AND GREATEST(EXTRACT(EPOCH FROM (now() - ss.sla_start_at))::integer, 0)
      >= GREATEST(COALESCE(ss.warning_hours, 24), 1)::integer * 3600;
$$;

GRANT EXECUTE ON FUNCTION public.get_sla_start_at(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_sla_pending_leads() TO authenticated, service_role;

CREATE UNIQUE INDEX IF NOT EXISTS pipelines_one_default_per_org
  ON public.pipelines (organization_id)
  WHERE is_default IS TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS stages_unique_position_per_pipeline
  ON public.stages (pipeline_id, position);
