-- Owner-aware lead redistribution.
-- A lead is only redistributed when the current assignee did not contact or move/update it.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS owner_last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS owner_last_activity_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS redistribution_warning_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_redistributed_at timestamptz;

ALTER TABLE public.pipelines
  ADD COLUMN IF NOT EXISTS pool_warning_minutes integer DEFAULT 2,
  ADD COLUMN IF NOT EXISTS pool_enabled_at timestamptz;

UPDATE public.pipelines
SET pool_enabled_at = COALESCE(pool_enabled_at, now())
WHERE pool_enabled = true;

CREATE INDEX IF NOT EXISTS idx_leads_pool_owner_activity
  ON public.leads(pipeline_id, assigned_at, owner_last_activity_at)
  WHERE assigned_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_pool_warning
  ON public.leads(pipeline_id, redistribution_warning_sent_at)
  WHERE assigned_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.mark_lead_owner_activity_for_redistribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_actor_id uuid;
  v_owner_touched boolean;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF OLD.assigned_user_id IS DISTINCT FROM NEW.assigned_user_id THEN
    NEW.owner_last_activity_at := NULL;
    NEW.owner_last_activity_user_id := NULL;
    NEW.redistribution_warning_sent_at := NULL;
  END IF;

  v_actor_id := auth.uid();

  v_owner_touched :=
    v_actor_id IS NOT NULL
    AND OLD.assigned_user_id IS NOT NULL
    AND v_actor_id = OLD.assigned_user_id
    AND NEW.assigned_user_id IS NOT DISTINCT FROM OLD.assigned_user_id
    AND (
      OLD.stage_id IS DISTINCT FROM NEW.stage_id
      OR OLD.stage_entered_at IS DISTINCT FROM NEW.stage_entered_at
      OR OLD.deal_status IS DISTINCT FROM NEW.deal_status
      OR OLD.name IS DISTINCT FROM NEW.name
      OR OLD.phone IS DISTINCT FROM NEW.phone
      OR OLD.email IS DISTINCT FROM NEW.email
      OR OLD.message IS DISTINCT FROM NEW.message
      OR OLD.feedback IS DISTINCT FROM NEW.feedback
      OR OLD.property_id IS DISTINCT FROM NEW.property_id
      OR OLD.property_code IS DISTINCT FROM NEW.property_code
    );

  IF v_owner_touched THEN
    NEW.owner_last_activity_at := now();
    NEW.owner_last_activity_user_id := v_actor_id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_mark_lead_owner_activity_for_redistribution ON public.leads;
CREATE TRIGGER tr_mark_lead_owner_activity_for_redistribution
BEFORE UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.mark_lead_owner_activity_for_redistribution();

CREATE OR REPLACE FUNCTION public.redistribute_lead_from_pool(p_lead_id uuid, p_reason text DEFAULT 'timeout')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_old_user_id uuid;
  v_old_user_name text;
  v_new_user_id uuid;
  v_new_user_name text;
  v_result jsonb;
  v_history_id uuid;
  v_elapsed_minutes integer;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead not found');
  END IF;

  v_old_user_id := v_lead.assigned_user_id;
  SELECT name INTO v_old_user_name FROM public.users WHERE id = v_old_user_id;

  v_elapsed_minutes := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(v_lead.assigned_at, v_lead.created_at))) / 60)::integer);

  INSERT INTO public.lead_pool_history (lead_id, organization_id, from_user_id, reason)
  VALUES (p_lead_id, v_lead.organization_id, v_old_user_id, p_reason)
  RETURNING id INTO v_history_id;

  UPDATE public.leads
  SET assigned_user_id = NULL,
      assigned_at = NULL,
      owner_last_activity_at = NULL,
      owner_last_activity_user_id = NULL,
      redistribution_warning_sent_at = NULL,
      last_redistributed_at = now(),
      redistribution_count = COALESCE(redistribution_count, 0) + 1
  WHERE id = p_lead_id;

  SELECT public.handle_lead_intake(p_lead_id) INTO v_result;

  IF v_old_user_id IS NOT NULL
     AND v_result->>'assigned_user_id' IS NOT NULL
     AND (v_result->>'assigned_user_id')::uuid = v_old_user_id THEN
    UPDATE public.leads
    SET assigned_user_id = NULL,
        assigned_at = NULL,
        owner_last_activity_at = NULL,
        owner_last_activity_user_id = NULL,
        redistribution_warning_sent_at = NULL
    WHERE id = p_lead_id;

    SELECT public.handle_lead_intake(p_lead_id) INTO v_result;
  END IF;

  IF v_result->>'assigned_user_id' IS NOT NULL THEN
    v_new_user_id := (v_result->>'assigned_user_id')::uuid;
    SELECT name INTO v_new_user_name FROM public.users WHERE id = v_new_user_id;

    UPDATE public.lead_pool_history
    SET to_user_id = v_new_user_id
    WHERE id = v_history_id;

    INSERT INTO public.notifications (organization_id, user_id, lead_id, type, title, content, is_read)
    VALUES (
      v_lead.organization_id,
      v_new_user_id,
      p_lead_id,
      'lead_redistributed',
      'Lead redistribuído para você',
      'O lead "' || COALESCE(v_lead.name, 'Sem nome') || '" estava há cerca de ' || v_elapsed_minutes || ' min sem atendimento pelo responsável anterior.',
      false
    );
  END IF;

  IF v_old_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (organization_id, user_id, lead_id, type, title, content, is_read)
    VALUES (
      v_lead.organization_id,
      v_old_user_id,
      p_lead_id,
      'lead_redistributed',
      'Lead redistribuído',
      'O lead "' || COALESCE(v_lead.name, 'Sem nome') || '" foi redistribuído por inatividade.',
      false
    );
  END IF;

  INSERT INTO public.lead_timeline_events (
    organization_id, lead_id, user_id, event_type, title, description, metadata
  ) VALUES (
    v_lead.organization_id,
    p_lead_id,
    v_new_user_id,
    'lead_redistributed',
    'Lead redistribuído',
    'Redistribuído por inatividade' ||
      CASE WHEN v_old_user_name IS NOT NULL THEN ' de ' || v_old_user_name ELSE '' END ||
      CASE WHEN v_new_user_name IS NOT NULL THEN ' para ' || v_new_user_name ELSE '' END,
    jsonb_build_object(
      'reason', p_reason,
      'from_user_id', v_old_user_id,
      'from_user_name', v_old_user_name,
      'to_user_id', v_new_user_id,
      'to_user_name', v_new_user_name,
      'elapsed_minutes', v_elapsed_minutes,
      'redistribution_count', COALESCE(v_lead.redistribution_count, 0) + 1
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'from_user_id', v_old_user_id,
    'to_user_id', v_new_user_id,
    'elapsed_minutes', v_elapsed_minutes,
    'redistribution_count', COALESCE(v_lead.redistribution_count, 0) + 1
  );
END;
$function$;
