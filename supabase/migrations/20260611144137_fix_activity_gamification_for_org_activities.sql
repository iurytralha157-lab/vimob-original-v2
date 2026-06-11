-- Keep activity gamification compatible with the current XP schema while allowing org-only activities.

CREATE OR REPLACE FUNCTION public.handle_activity_gamification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_action_type text;
  v_org_id uuid;
  v_to_stage text;
BEGIN
  SELECT COALESCE(NEW.organization_id, u.organization_id)
    INTO v_org_id
  FROM public.users u
  WHERE u.id = NEW.user_id;

  v_org_id := COALESCE(v_org_id, NEW.organization_id);

  IF NEW.user_id IS NULL OR v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'activities' THEN
    IF NEW.type = 'call' THEN
      v_action_type := 'call_made';
    ELSIF NEW.type IN ('message', 'whatsapp', 'email') THEN
      v_action_type := 'message_sent';
    ELSIF NEW.type = 'lead_created' THEN
      v_action_type := 'lead_created_manual';
    ELSIF NEW.type = 'property_created' THEN
      v_action_type := 'property_created';
    ELSIF NEW.type = 'visit_scheduled' THEN
      v_action_type := 'visit_scheduled';
    ELSIF NEW.type = 'visit_confirmed' THEN
      v_action_type := 'visit_confirmed';
    ELSIF NEW.type = 'meeting_held' THEN
      v_action_type := 'meeting_held';
    ELSIF NEW.type = 'stage_change' THEN
      v_to_stage := NEW.metadata->>'to_stage';
      IF v_to_stage ILIKE '%Venda%' OR v_to_stage ILIKE '%Ganh%' OR v_to_stage ILIKE '%Fechamento%' THEN
        v_action_type := 'sale_closed';
      ELSIF v_to_stage ILIKE '%Contrato%' THEN
        v_action_type := 'contract_signed';
      ELSIF v_to_stage ILIKE '%Proposta%' THEN
        v_action_type := 'proposal_sent';
      ELSIF v_to_stage ILIKE '%Visita%' AND (v_to_stage ILIKE '%Realizada%' OR v_to_stage ILIKE '%Confirmada%') THEN
        v_action_type := 'visit_confirmed';
      ELSIF v_to_stage ILIKE '%Visita%' AND v_to_stage ILIKE '%Agendada%' THEN
        v_action_type := 'visit_scheduled';
      ELSIF v_to_stage ILIKE '%Reunião%' THEN
        v_action_type := 'meeting_held';
      ELSE
        RETURN NEW;
      END IF;
    ELSE
      RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'prospecting_reports' THEN
    v_action_type := 'prospecting_report';
  ELSIF TG_TABLE_NAME = 'missions' THEN
    v_action_type := 'mission_bonus';
  ELSIF TG_TABLE_NAME = 'schedule_events' THEN
    IF NEW.event_type = 'visit' THEN
      v_action_type := 'visit_scheduled';
    ELSIF NEW.event_type = 'meeting' THEN
      v_action_type := 'meeting_held';
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.process_gamification_event(
    NEW.user_id,
    v_org_id,
    v_action_type,
    1,
    NEW.id,
    COALESCE(NEW.metadata, '{}'::jsonb)
  );

  RETURN NEW;
END;
$function$;
