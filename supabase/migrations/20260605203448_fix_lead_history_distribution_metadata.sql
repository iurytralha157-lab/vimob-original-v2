-- Keep lead intake history auditable: origin, distribution queue and assignee.
-- Production previously had an older handle_lead_intake() that assigned leads
-- without recording successful round_robin_logs or timeline metadata.

CREATE OR REPLACE FUNCTION public.handle_lead_intake(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lead RECORD;
  v_org_id uuid;
  v_queue RECORD;
  v_next_user_id uuid;
  v_matched_queue_id uuid;
  v_next_user_name text;
  v_member RECORD;
  v_is_available boolean;
  v_current_day integer;
  v_current_time time;
  v_team_member_id uuid;
  v_matched_member_id uuid;
  v_log_reason text;
  v_has_availability_config boolean;
  v_source_label text;
BEGIN
  v_current_day := EXTRACT(DOW FROM (NOW() AT TIME ZONE 'America/Sao_Paulo'))::int;
  v_current_time := (NOW() AT TIME ZONE 'America/Sao_Paulo')::time;

  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_not_found');
  END IF;

  v_org_id := v_lead.organization_id;
  v_source_label := CASE v_lead.source
    WHEN 'meta' THEN 'Meta Ads'
    WHEN 'meta_ads' THEN 'Meta Ads'
    WHEN 'whatsapp' THEN 'WhatsApp'
    WHEN 'webhook' THEN 'Webhook'
    WHEN 'website' THEN 'Site'
    WHEN 'site' THEN 'Site'
    WHEN 'manual' THEN 'Manual'
    ELSE COALESCE(v_lead.source, 'manual')
  END;

  IF NOT EXISTS (
    SELECT 1 FROM public.lead_timeline_events
    WHERE lead_id = p_lead_id AND event_type = 'lead_created'
  ) THEN
    INSERT INTO public.lead_timeline_events (
      lead_id, organization_id, user_id, event_type, title, description, metadata
    ) VALUES (
      p_lead_id, v_org_id, NULL, 'lead_created',
      'Lead criado',
      'Lead recebido no sistema',
      jsonb_build_object(
        'source', v_lead.source,
        'source_label', v_source_label,
        'utm_source', v_lead.utm_source,
        'source_webhook_id', v_lead.source_webhook_id,
        'source_session_id', v_lead.source_session_id
      )
    );
  END IF;

  IF v_lead.assigned_user_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'assigned_user_id', v_lead.assigned_user_id,
      'reason', 'already_assigned'
    );
  END IF;

  v_matched_queue_id := public.pick_round_robin_for_lead(p_lead_id);

  IF v_matched_queue_id IS NOT NULL THEN
    SELECT * INTO v_queue
    FROM public.round_robins
    WHERE id = v_matched_queue_id AND is_active = true;
  END IF;

  IF v_queue IS NULL THEN
    INSERT INTO public.round_robin_logs (organization_id, lead_id, reason)
    VALUES (v_org_id, p_lead_id, 'no_matching_queue');

    INSERT INTO public.lead_timeline_events (
      lead_id, organization_id, user_id, event_type, title, description, metadata
    ) VALUES (
      p_lead_id, v_org_id, NULL, 'lead_assigned',
      'Aguardando distribuição',
      'Nenhuma fila de distribuição ativa encontrada para as regras deste lead.',
      jsonb_build_object('destination', 'pool', 'reason', 'no_matching_queue')
    );

    RETURN jsonb_build_object('success', false, 'reason', 'no_matching_queue');
  END IF;

  FOR v_member IN
    SELECT rrm.*, u.name as user_name, u.is_active as user_active
    FROM public.round_robin_members rrm
    JOIN public.users u ON u.id = rrm.user_id
    WHERE rrm.round_robin_id = v_queue.id
      AND u.organization_id = v_org_id
    ORDER BY COALESCE(rrm.leads_count, 0) ASC, rrm.position ASC
  LOOP
    CONTINUE WHEN NOT v_member.user_active;

    v_is_available := false;
    v_log_reason := NULL;

    IF v_member.team_id IS NULL THEN
      v_is_available := true;
      v_log_reason := 'direct_user_24h';
    ELSE
      SELECT id INTO v_team_member_id
      FROM public.team_members
      WHERE user_id = v_member.user_id AND team_id = v_member.team_id
      LIMIT 1;

      IF v_team_member_id IS NULL THEN
        CONTINUE;
      END IF;

      SELECT EXISTS (
        SELECT 1 FROM public.member_availability
        WHERE team_member_id = v_team_member_id AND is_active = true
      ) INTO v_has_availability_config;

      IF NOT v_has_availability_config THEN
        v_is_available := true;
        v_log_reason := 'team_user_no_schedule_default';
      ELSE
        SELECT EXISTS (
          SELECT 1
          FROM public.member_availability
          WHERE team_member_id = v_team_member_id
            AND day_of_week = v_current_day
            AND is_active = true
            AND (
              is_all_day = true
              OR (
                start_time IS NOT NULL
                AND end_time IS NOT NULL
                AND v_current_time BETWEEN start_time AND end_time
              )
            )
        ) INTO v_is_available;

        v_log_reason := CASE WHEN v_is_available THEN 'team_user_within_schedule' ELSE 'team_user_outside_schedule' END;
      END IF;
    END IF;

    IF v_is_available THEN
      v_next_user_id := v_member.user_id;
      v_next_user_name := v_member.user_name;
      v_matched_member_id := v_member.id;
      EXIT;
    END IF;
  END LOOP;

  IF v_next_user_id IS NULL THEN
    INSERT INTO public.round_robin_logs (organization_id, round_robin_id, lead_id, reason)
    VALUES (v_org_id, v_queue.id, p_lead_id, 'no_available_members');

    INSERT INTO public.lead_timeline_events (
      lead_id, organization_id, user_id, event_type, title, description, metadata
    ) VALUES (
      p_lead_id, v_org_id, NULL, 'lead_assigned',
      'Aguardando distribuição',
      'Fila "' || v_queue.name || '" sem membros disponíveis no momento.',
      jsonb_build_object(
        'destination', 'pool',
        'queue_name', v_queue.name,
        'distribution_queue_name', v_queue.name,
        'queue_id', v_queue.id,
        'distribution_queue_id', v_queue.id,
        'reason', 'no_available_members'
      )
    );

    RETURN jsonb_build_object('success', false, 'reason', 'no_available_members', 'round_robin_id', v_queue.id);
  END IF;

  UPDATE public.leads
  SET assigned_user_id = v_next_user_id,
      pipeline_id = COALESCE(v_queue.target_pipeline_id, pipeline_id),
      stage_id = COALESCE(v_queue.target_stage_id, stage_id),
      assigned_at = now(),
      updated_at = now()
  WHERE id = p_lead_id;

  UPDATE public.round_robin_members
  SET leads_count = COALESCE(leads_count, 0) + 1
  WHERE id = v_matched_member_id;

  INSERT INTO public.assignments_log (lead_id, organization_id, round_robin_id, assigned_user_id, reason)
  VALUES (p_lead_id, v_org_id, v_queue.id, v_next_user_id, 'round_robin_auto');

  INSERT INTO public.round_robin_logs (
    organization_id, round_robin_id, lead_id, assigned_user_id, member_id, reason
  ) VALUES (
    v_org_id, v_queue.id, p_lead_id, v_next_user_id, v_matched_member_id,
    jsonb_build_object(
      'type', CASE WHEN v_member.team_id IS NULL THEN 'direct' ELSE 'team' END,
      'availability_check', v_log_reason,
      'queue_name', v_queue.name
    )::text
  );

  INSERT INTO public.lead_timeline_events (
    lead_id, organization_id, user_id, event_type, title, description, metadata
  ) VALUES (
    p_lead_id, v_org_id, v_next_user_id, 'lead_assigned',
    'Distribuído via "' || v_queue.name || '"',
    'Atribuído a ' || COALESCE(v_next_user_name, 'usuário') || ' pela fila "' || v_queue.name || '"',
    jsonb_build_object(
      'source', v_lead.source,
      'source_label', v_source_label,
      'queue_name', v_queue.name,
      'distribution_queue_name', v_queue.name,
      'queue_id', v_queue.id,
      'distribution_queue_id', v_queue.id,
      'assigned_user_id', v_next_user_id,
      'assigned_user_name', v_next_user_name,
      'to_user_id', v_next_user_id,
      'to_user_name', v_next_user_name,
      'is_initial_distribution', true,
      'distribution_type', 'round_robin'
    )
  );

  PERFORM public.notify_whatsapp_on_lead(v_org_id, v_next_user_id, v_lead.name, v_lead.source);

  RETURN jsonb_build_object(
    'success', true,
    'assigned_user_id', v_next_user_id,
    'assigned_user_name', v_next_user_name,
    'round_robin_id', v_queue.id,
    'round_robin_name', v_queue.name,
    'member_id', v_matched_member_id
  );
END;
$function$;
