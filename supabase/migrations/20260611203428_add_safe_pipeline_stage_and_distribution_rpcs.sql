-- Centralize sensitive pipeline moves and lead redistribution behind checked RPCs.

CREATE OR REPLACE FUNCTION public.move_lead_stage(
  p_lead_id uuid,
  p_stage_id uuid,
  p_is_own_resource boolean DEFAULT NULL
)
RETURNS public.leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_user_org_id uuid;
  v_is_admin boolean := false;
  v_has_privileged_permission boolean := false;
  v_is_team_leader boolean := false;
  v_has_pipeline_lock boolean := false;
  v_lead public.leads;
  v_stage record;
  v_result public.leads;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT organization_id, role IN ('admin', 'super_admin')
  INTO v_user_org_id, v_is_admin
  FROM public.users
  WHERE id = v_user_id;

  IF v_user_org_id IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  SELECT *
  INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  IF v_lead.organization_id IS DISTINCT FROM v_user_org_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Lead is outside the user organization';
  END IF;

  SELECT s.id, s.pipeline_id, p.organization_id
  INTO v_stage
  FROM public.stages s
  JOIN public.pipelines p ON p.id = s.pipeline_id
  WHERE s.id = p_stage_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target stage not found';
  END IF;

  IF v_stage.organization_id IS DISTINCT FROM v_lead.organization_id THEN
    RAISE EXCEPTION 'Target stage belongs to another organization';
  END IF;

  v_has_privileged_permission :=
    public.user_has_permission('lead_edit_all', v_user_id)
    OR public.user_has_permission('settings_pipelines', v_user_id);

  v_has_pipeline_lock := public.user_has_permission('pipeline_lock', v_user_id);

  SELECT public.is_team_leader(v_user_id) AND (
    COALESCE(v_lead.pipeline_id = ANY(ARRAY(SELECT public.get_user_led_pipeline_ids())), false)
    OR COALESCE(v_stage.pipeline_id = ANY(ARRAY(SELECT public.get_user_led_pipeline_ids())), false)
    OR EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.user_id = v_lead.assigned_user_id
        AND tm.team_id IN (SELECT public.get_user_led_team_ids())
    )
  )
  INTO v_is_team_leader;

  IF NOT (
    v_is_admin
    OR v_has_privileged_permission
    OR v_is_team_leader
    OR v_lead.assigned_user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'User cannot move this lead';
  END IF;

  IF v_has_pipeline_lock AND NOT (v_is_admin OR v_has_privileged_permission OR v_is_team_leader) THEN
    RAISE EXCEPTION 'User is locked from moving pipeline cards';
  END IF;

  UPDATE public.leads
  SET
    stage_id = p_stage_id,
    pipeline_id = v_stage.pipeline_id,
    stage_entered_at = CASE
      WHEN stage_id IS DISTINCT FROM p_stage_id THEN now()
      ELSE stage_entered_at
    END,
    is_own_resource = COALESCE(p_is_own_resource, is_own_resource),
    updated_at = now()
  WHERE id = p_lead_id
  RETURNING *
  INTO v_result;

  RETURN v_result;
END;
$$;

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

GRANT EXECUTE ON FUNCTION public.move_lead_stage(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redistribute_lead_round_robin(uuid) TO authenticated;
