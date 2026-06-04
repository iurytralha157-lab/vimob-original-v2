-- Unified Gamification System Correction
-- This migration centralizes all scoring logic and fixes triggers

-- 1. Schema Updates
ALTER TABLE public.gamification_missions 
ADD COLUMN IF NOT EXISTS target_scope text DEFAULT 'organization',
ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES public.profiles(id);

-- 2. Add unique constraint for idempotency
DROP INDEX IF EXISTS idx_gamification_activity_idempotency;
CREATE UNIQUE INDEX idx_gamification_activity_idempotency 
ON public.gamification_activity_logs (organization_id, action_type, reference_id) 
WHERE reference_id IS NOT NULL;

-- 3. Centralized Scoring Function
CREATE OR REPLACE FUNCTION public.award_gamification_points(
    p_user_id uuid,
    p_organization_id uuid,
    p_action_type text,
    p_reference_id uuid DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_points integer;
    v_rule_id uuid;
BEGIN
    -- Get points from rules
    SELECT id, points INTO v_rule_id, v_points
    FROM public.gamification_rules
    WHERE organization_id = p_organization_id 
      AND action_type = p_action_type
      AND is_active = true
    LIMIT 1;

    -- Default points if no rule found
    IF v_points IS NULL THEN
        CASE p_action_type
            WHEN 'lead_created' THEN v_points := 10;
            WHEN 'sale_closed' THEN v_points := 500;
            WHEN 'visit_confirmed' THEN v_points := 100;
            WHEN 'call_made' THEN v_points := 5;
            WHEN 'prospecting_report' THEN v_points := 20;
            ELSE v_points := 0;
        END CASE;
    END IF;

    IF v_points = 0 THEN
        RETURN;
    END IF;

    -- Log activity
    BEGIN
        INSERT INTO public.gamification_activity_logs (
            user_id,
            organization_id,
            action_type,
            points,
            reference_id,
            metadata
        ) VALUES (
            p_user_id,
            p_organization_id,
            p_action_type,
            v_points,
            p_reference_id,
            p_metadata
        );
    EXCEPTION WHEN unique_violation THEN
        RETURN;
    END;

    -- Update User Points
    UPDATE public.profiles
    SET 
        xp = COALESCE(xp, 0) + v_points,
        points = COALESCE(points, 0) + v_points
    WHERE id = p_user_id;

    -- Update Mission Progress
    UPDATE public.gamification_missions
    SET current_progress = current_progress + 1
    WHERE organization_id = p_organization_id
      AND is_active = true
      AND mission_type = p_action_type
      AND (target_scope = 'organization' OR target_user_id = p_user_id)
      AND (reset_period = 'never' OR last_reset_at > (
          CASE reset_period
              WHEN 'daily' THEN CURRENT_DATE
              WHEN 'weekly' THEN date_trunc('week', CURRENT_DATE)
              WHEN 'monthly' THEN date_trunc('month', CURRENT_DATE)
              ELSE '1900-01-01'::date
          END
      ));

END;
$$;

-- 4. Unified Triggers
CREATE OR REPLACE FUNCTION public.handle_lead_gamification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        IF NEW.assigned_user_id IS NOT NULL THEN
            PERFORM award_gamification_points(
                NEW.assigned_user_id,
                NEW.organization_id,
                'lead_created',
                NEW.id,
                jsonb_build_object('lead_name', NEW.name)
            );
        END IF;
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (NEW.deal_status = 'won' AND (OLD.deal_status IS NULL OR OLD.deal_status != 'won')) THEN
            IF NEW.assigned_user_id IS NOT NULL THEN
                PERFORM award_gamification_points(
                    NEW.assigned_user_id,
                    NEW.organization_id,
                    'sale_closed',
                    NEW.id,
                    jsonb_build_object('lead_name', NEW.name, 'value', NEW.valor_interesse)
                );
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_lead_gamification ON public.leads;
CREATE TRIGGER tr_lead_gamification
AFTER INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.handle_lead_gamification();

CREATE OR REPLACE FUNCTION public.handle_call_gamification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.user_id IS NOT NULL THEN
        PERFORM award_gamification_points(
            NEW.user_id,
            NEW.organization_id,
            'call_made',
            NEW.id,
            jsonb_build_object('lead_id', NEW.lead_id)
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_call_gamification ON public.telephony_calls;
CREATE TRIGGER tr_call_gamification
AFTER INSERT ON public.telephony_calls
FOR EACH ROW EXECUTE FUNCTION public.handle_call_gamification();

CREATE OR REPLACE FUNCTION public.handle_schedule_gamification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF (NEW.status IN ('realizado', 'confirmado') AND (OLD.status IS NULL OR OLD.status NOT IN ('realizado', 'confirmado'))) THEN
        IF NEW.user_id IS NOT NULL THEN
            PERFORM award_gamification_points(
                NEW.user_id,
                NEW.organization_id,
                'visit_confirmed',
                NEW.id,
                jsonb_build_object('lead_id', NEW.lead_id, 'event_type', NEW.event_type)
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_schedule_gamification ON public.schedule_events;
CREATE TRIGGER tr_schedule_gamification
AFTER UPDATE ON public.schedule_events
FOR EACH ROW EXECUTE FUNCTION public.handle_schedule_gamification();

CREATE OR REPLACE FUNCTION public.handle_prospecting_report_gamification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM award_gamification_points(
        NEW.user_id,
        NEW.organization_id,
        'prospecting_report',
        NEW.id,
        jsonb_build_object('source', NEW.source)
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_gamification_prospecting ON public.prospecting_reports;
DROP TRIGGER IF EXISTS tr_prospecting_gamification ON public.prospecting_reports;
DROP TRIGGER IF EXISTS tr_prospecting_report_points ON public.prospecting_reports;

CREATE TRIGGER tr_prospecting_report_gamification
AFTER INSERT ON public.prospecting_reports
FOR EACH ROW EXECUTE FUNCTION public.handle_prospecting_report_gamification();
