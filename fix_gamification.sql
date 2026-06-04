
-- Fix gamification for schedule events
CREATE OR REPLACE FUNCTION public.handle_schedule_gamification()
RETURNS TRIGGER AS $$
DECLARE
    points_to_add INTEGER := 0;
    action_type_val TEXT;
    idempotency_key TEXT;
BEGIN
    -- Determinar pontos e tipo de ação baseado no tipo de evento e status
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        IF NEW.event_type = 'visit' THEN
            points_to_add := 20; -- Visita realizada
            action_type_val := 'visit_made';
        ELSIF NEW.event_type = 'meeting' THEN
            points_to_add := 15; -- Reunião realizada
            action_type_val := 'meeting_made';
        END IF;
    ELSIF TG_OP = 'INSERT' THEN
        IF NEW.event_type = 'visit' THEN
            points_to_add := 10; -- Visita agendada
            action_type_val := 'visit_scheduled';
        ELSIF NEW.event_type = 'meeting' THEN
            points_to_add := 5; -- Reunião agendada
            action_type_val := 'meeting_scheduled';
        END IF;
    END IF;

    IF points_to_add > 0 THEN
        idempotency_key := action_type_val || '_' || NEW.id || '_' || COALESCE(NEW.status, 'none');
        
        INSERT INTO public.gamification_activity_logs (
            user_id,
            organization_id,
            action_type,
            points_earned,
            reference_id,
            idempotency_key
        ) VALUES (
            NEW.user_id,
            NEW.organization_id,
            action_type_val,
            points_to_add,
            NEW.id,
            idempotency_key
        ) ON CONFLICT (idempotency_key) DO NOTHING;

        -- Atualizar pontos do usuário
        UPDATE public.users 
        SET points = COALESCE(points, 0) + points_to_add 
        WHERE id = NEW.user_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-create the trigger for schedule_events
DROP TRIGGER IF EXISTS tr_schedule_gamification ON public.schedule_events;
CREATE TRIGGER tr_schedule_gamification
AFTER INSERT OR UPDATE ON public.schedule_events
FOR EACH ROW EXECUTE FUNCTION public.handle_schedule_gamification();

-- Fix prospecting report gamification to avoid idempotency errors
CREATE OR REPLACE FUNCTION public.handle_prospecting_report_points()
RETURNS TRIGGER AS $$
DECLARE
    total_points INTEGER := 0;
    activity_points INTEGER := 0;
BEGIN
    -- Pontuação: ligação = 5, visita = 20, captação = 15, proposta = 10
    total_points := (NEW.calls * 5) + (NEW.visits * 20) + (NEW.property_capturing * 15) + (NEW.proposals_sent * 10);
    
    IF total_points > 0 THEN
        -- Registra no log de gamificação com idempotency_key segura
        INSERT INTO public.gamification_activity_logs (
            user_id,
            organization_id,
            action_type,
            points_earned,
            reference_id,
            idempotency_key
        ) VALUES (
            NEW.user_id,
            NEW.organization_id,
            'prospecting_report',
            total_points,
            NEW.id,
            'prospecting_' || NEW.id
        ) ON CONFLICT (idempotency_key) DO NOTHING;

        -- Atualiza pontos do usuário
        UPDATE public.users 
        SET points = COALESCE(points, 0) + total_points 
        WHERE id = NEW.user_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_prospecting_report_points ON public.prospecting_reports;
CREATE TRIGGER tr_prospecting_report_points
AFTER INSERT ON public.prospecting_reports
FOR EACH ROW EXECUTE FUNCTION public.handle_prospecting_report_points();
