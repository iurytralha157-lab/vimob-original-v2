-- 1. Redefine the gamification trigger function
CREATE OR REPLACE FUNCTION public.handle_activity_gamification()
RETURNS TRIGGER AS $$
DECLARE
    v_points INTEGER := 0;
    v_action_type TEXT;
    v_org_id UUID;
    v_rule_points INTEGER;
    v_to_stage TEXT;
BEGIN
    -- Get organization ID
    SELECT organization_id INTO v_org_id FROM public.users WHERE id = NEW.user_id;
    IF v_org_id IS NULL THEN RETURN NEW; END IF;

    -- Mapping CRM types to Gamification types
    IF TG_TABLE_NAME = 'activities' THEN
        IF NEW.type = 'call' THEN v_action_type := 'call_made';
        ELSIF NEW.type = 'message' THEN v_action_type := 'message_sent';
        ELSIF NEW.type = 'lead_created' THEN v_action_type := 'lead_created_manual';
        ELSIF NEW.type = 'property_created' THEN v_action_type := 'property_created';
        ELSIF NEW.type = 'visit_scheduled' THEN v_action_type := 'visit_scheduled';
        ELSIF NEW.type = 'visit_confirmed' THEN v_action_type := 'visit_confirmed';
        ELSIF NEW.type = 'meeting_held' THEN v_action_type := 'meeting_held';
        ELSIF NEW.type = 'stage_change' THEN
            v_to_stage := NEW.metadata->>'to_stage';
            IF v_to_stage ILIKE '%Venda%' OR v_to_stage ILIKE '%Ganh%' OR v_to_stage ILIKE '%Fechamento%' THEN v_action_type := 'sale_closed';
            ELSIF v_to_stage ILIKE '%Contrato%' THEN v_action_type := 'contract_signed';
            ELSIF v_to_stage ILIKE '%Proposta%' THEN v_action_type := 'proposal_sent';
            ELSIF v_to_stage ILIKE '%Visita%' AND (v_to_stage ILIKE '%Realizada%' OR v_to_stage ILIKE '%Confirmada%') THEN v_action_type := 'visit_confirmed';
            ELSIF v_to_stage ILIKE '%Visita%' AND v_to_stage ILIKE '%Agendada%' THEN v_action_type := 'visit_scheduled';
            ELSIF v_to_stage ILIKE '%Reunião%' THEN v_action_type := 'meeting_held';
            ELSE RETURN NEW; END IF;
        ELSE RETURN NEW; END IF;
    ELSIF TG_TABLE_NAME = 'prospecting_reports' THEN
        v_action_type := 'prospecting_report';
    ELSIF TG_TABLE_NAME = 'missions' THEN
        v_action_type := 'mission_bonus';
    ELSIF TG_TABLE_NAME = 'schedule_events' THEN
        IF NEW.event_type = 'visit' THEN v_action_type := 'visit_scheduled';
        ELSIF NEW.event_type = 'meeting' THEN v_action_type := 'meeting_held';
        ELSE RETURN NEW; END IF;
    ELSE
        RETURN NEW;
    END IF;

    -- Fetch points from organization settings
    SELECT points INTO v_rule_points FROM public.gamification_rules 
    WHERE organization_id = v_org_id AND action_type = v_action_type AND is_active = true LIMIT 1;

    -- Fallback points
    IF v_rule_points IS NULL THEN
        CASE v_action_type
            WHEN 'sale_closed' THEN v_rule_points := 100;
            WHEN 'contract_signed' THEN v_rule_points := 50;
            WHEN 'proposal_sent' THEN v_rule_points := 20;
            WHEN 'prospecting_report' THEN v_rule_points := 5;
            WHEN 'call_made' THEN v_rule_points := 1;
            WHEN 'message_sent' THEN v_rule_points := 1;
            WHEN 'visit_scheduled' THEN v_rule_points := 50;
            WHEN 'visit_confirmed' THEN v_rule_points := 70;
            WHEN 'meeting_held' THEN v_rule_points := 50;
            ELSE v_rule_points := 5;
        END CASE;
    END IF;

    v_points := v_rule_points;

    -- Record the event
    INSERT INTO public.gamification_activity_logs (user_id, organization_id, action_type, points_earned, reference_id, metadata)
    VALUES (NEW.user_id, v_org_id, v_action_type, v_points, NEW.id, NEW.metadata);

    INSERT INTO public.gamification_events (user_id, organization_id, event_type, points_earned, source_id, metadata)
    VALUES (NEW.user_id, v_org_id, v_action_type, v_points, NEW.id, NEW.metadata);

    -- Update total points
    INSERT INTO public.user_gamification_stats (user_id, organization_id, total_points, updated_at)
    VALUES (NEW.user_id, v_org_id, v_points, now())
    ON CONFLICT (user_id) DO UPDATE SET total_points = public.user_gamification_stats.total_points + EXCLUDED.total_points, updated_at = now();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Ensure trigger exists on activities
DROP TRIGGER IF EXISTS tr_activity_gamification ON public.activities;
CREATE TRIGGER tr_activity_gamification 
AFTER INSERT ON public.activities 
FOR EACH ROW EXECUTE FUNCTION handle_activity_gamification();

-- 3. Add trigger to schedule_events
DROP TRIGGER IF EXISTS tr_schedule_events_gamification ON public.schedule_events;
CREATE TRIGGER tr_schedule_events_gamification 
AFTER INSERT ON public.schedule_events 
FOR EACH ROW EXECUTE FUNCTION handle_activity_gamification();

-- 4. Manual script to fix missing points (using INSERT to bypass trigger constraints and ensure it works once)
DO $$
DECLARE
    r RECORD;
    v_points INTEGER;
    v_org_id UUID;
BEGIN
    FOR r IN (
        SELECT id, user_id, type, metadata, created_at FROM public.activities 
        WHERE id IN (
            '97115e58-e19a-47e2-af2c-7c9aeca442d0', 
            '4a34b8ed-1e09-4b56-bfb7-6a9917a0077b',
            '9c5f0489-fe8c-45ea-8c6b-ca945fa7b3c7',
            'f5614a66-2e1b-4e54-8520-f9bb7e569ee6',
            'd220990e-66bd-407a-9f98-9d33e977a234'
        ) AND id NOT IN (SELECT source_id FROM public.gamification_events)
    ) LOOP
        SELECT organization_id INTO v_org_id FROM public.users WHERE id = r.user_id;
        
        IF r.type = 'visit_scheduled' THEN v_points := 50;
        ELSIF r.type = 'visit_confirmed' THEN v_points := 70;
        ELSIF r.type = 'meeting_held' THEN v_points := 50;
        ELSE v_points := 5;
        END IF;

        -- Check if rule exists
        SELECT points INTO v_points FROM public.gamification_rules 
        WHERE organization_id = v_org_id AND action_type = r.type AND is_active = true LIMIT 1;
        
        IF v_points IS NULL THEN
            IF r.type = 'visit_scheduled' THEN v_points := 50;
            ELSIF r.type = 'visit_confirmed' THEN v_points := 70;
            ELSIF r.type = 'meeting_held' THEN v_points := 50;
            ELSE v_points := 5;
            END IF;
        END IF;

        INSERT INTO public.gamification_activity_logs (user_id, organization_id, action_type, points_earned, reference_id, metadata, created_at)
        VALUES (r.user_id, v_org_id, r.type, v_points, r.id, r.metadata, r.created_at);

        INSERT INTO public.gamification_events (user_id, organization_id, event_type, points_earned, source_id, metadata, created_at)
        VALUES (r.user_id, v_org_id, r.type, v_points, r.id, r.metadata, r.created_at);

        UPDATE public.user_gamification_stats SET total_points = total_points + v_points, updated_at = now() WHERE user_id = r.user_id;
    END LOOP;
END $$;
