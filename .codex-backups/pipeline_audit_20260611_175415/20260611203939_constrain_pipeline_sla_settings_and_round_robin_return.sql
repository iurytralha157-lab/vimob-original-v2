-- Keep pipeline SLA configuration deterministic and make the round-robin redistribution RPC report the original assignee.

CREATE UNIQUE INDEX IF NOT EXISTS pipeline_sla_settings_one_pipeline_default
  ON public.pipeline_sla_settings (pipeline_id)
  WHERE stage_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pipeline_sla_settings_positive_hours'
      AND conrelid = 'public.pipeline_sla_settings'::regclass
  ) THEN
    ALTER TABLE public.pipeline_sla_settings
      ADD CONSTRAINT pipeline_sla_settings_positive_hours
      CHECK (
        warning_hours IS NULL OR warning_hours >= 1
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pipeline_sla_settings_positive_critical_hours'
      AND conrelid = 'public.pipeline_sla_settings'::regclass
  ) THEN
    ALTER TABLE public.pipeline_sla_settings
      ADD CONSTRAINT pipeline_sla_settings_positive_critical_hours
      CHECK (
        critical_hours IS NULL OR critical_hours >= 1
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pipeline_sla_settings_critical_after_warning'
      AND conrelid = 'public.pipeline_sla_settings'::regclass
  ) THEN
    ALTER TABLE public.pipeline_sla_settings
      ADD CONSTRAINT pipeline_sla_settings_critical_after_warning
      CHECK (
        critical_hours IS NULL
        OR warning_hours IS NULL
        OR critical_hours >= warning_hours
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pipeline_sla_settings_valid_start_field'
      AND conrelid = 'public.pipeline_sla_settings'::regclass
  ) THEN
    ALTER TABLE public.pipeline_sla_settings
      ADD CONSTRAINT pipeline_sla_settings_valid_start_field
      CHECK (
        sla_start_field IN ('created_at', 'stage_entered_at', 'stage_entered', 'assigned_at', 'lead_assigned')
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.redistribute_lead_round_robin(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_previous_assigned_user_id uuid;
  v_transfer_result public.leads;
  v_distribution_result jsonb;
BEGIN
  SELECT assigned_user_id
  INTO v_previous_assigned_user_id
  FROM public.leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  SELECT *
  INTO v_transfer_result
  FROM public.transfer_lead_assignee(p_lead_id, NULL);

  SELECT public.handle_lead_intake(p_lead_id)
  INTO v_distribution_result;

  RETURN jsonb_build_object(
    'previous_assigned_user_id', v_previous_assigned_user_id,
    'lead_id', p_lead_id,
    'distribution_result', v_distribution_result
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redistribute_lead_round_robin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redistribute_lead_round_robin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.redistribute_lead_round_robin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redistribute_lead_round_robin(uuid) TO service_role;
