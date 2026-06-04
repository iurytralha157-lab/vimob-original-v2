-- Reescrever trigger para processar relatório de prospecção com regras de organização
-- Grava em: gamification_activity_logs, gamification_events, user_gamification_stats
-- Metadata detalhada: count, unit_points, total_points, source, description, report_id

CREATE OR REPLACE FUNCTION public.handle_prospecting_report_points()
RETURNS trigger AS $$
DECLARE
    v_org_id UUID;
    v_call_points INTEGER := 0;
    v_visit_points INTEGER := 0;
    v_proposal_points INTEGER := 0;
    v_rule_points INTEGER;
    v_total_points INTEGER := 0;
    v_call_rule_active BOOLEAN := false;
    v_visit_rule_active BOOLEAN := false;
    v_proposal_rule_active BOOLEAN := false;
BEGIN
    v_org_id := NEW.organization_id;
    
    IF v_org_id IS NULL THEN RETURN NEW; END IF;
    
    -- Buscar pontos das regras ativas para cada tipo
    SELECT is_active, points INTO v_call_rule_active, v_rule_points 
    FROM public.gamification_rules 
    WHERE organization_id = v_org_id AND action_type = 'call_made' AND is_active = true 
    LIMIT 1;
    IF v_call_rule_active THEN v_call_points := COALESCE(NEW.calls, 0) * v_rule_points; END IF;
    
    SELECT is_active, points INTO v_visit_rule_active, v_rule_points 
    FROM public.gamification_rules 
    WHERE organization_id = v_org_id AND action_type = 'visit_scheduled' AND is_active = true 
    LIMIT 1;
    IF v_visit_rule_active THEN v_visit_points := COALESCE(NEW.visits, 0) * v_rule_points; END IF;
    
    SELECT is_active, points INTO v_proposal_rule_active, v_rule_points 
    FROM public.gamification_rules 
    WHERE organization_id = v_org_id AND action_type = 'proposal_sent' AND is_active = true 
    LIMIT 1;
    IF v_proposal_rule_active THEN v_proposal_points := COALESCE(NEW.proposals_sent, 0) * v_rule_points; END IF;
    
    v_total_points := v_call_points + v_visit_points + v_proposal_points;
    
    IF v_total_points <= 0 THEN RETURN NEW; END IF;
    
    -- Registrar cada ação se houver quantidade e regra ativa
    IF COALESCE(NEW.calls, 0) > 0 AND v_call_rule_active THEN
        INSERT INTO public.gamification_activity_logs (
            user_id, organization_id, action_type, points_earned, reference_id,
            metadata, created_at
        ) VALUES (
            NEW.user_id, v_org_id, 'call_made', v_call_points, NEW.id,
            jsonb_build_object(
                'count', NEW.calls,
                'unit_points', (SELECT points FROM public.gamification_rules WHERE organization_id = v_org_id AND action_type = 'call_made' LIMIT 1),
                'total_points', v_call_points,
                'source', NEW.source,
                'description', NEW.description,
                'report_id', NEW.id::text,
                'manual_entry', true
            ),
            NEW.created_at
        );
        
        INSERT INTO public.gamification_events (
            user_id, organization_id, event_type, points_earned, source_id,
            source_module, metadata, created_at
        ) VALUES (
            NEW.user_id, v_org_id, 'call_made', v_call_points, NEW.id,
            'prospecting_report',
            jsonb_build_object(
                'count', NEW.calls,
                'unit_points', (SELECT points FROM public.gamification_rules WHERE organization_id = v_org_id AND action_type = 'call_made' LIMIT 1),
                'total_points', v_call_points,
                'source', NEW.source,
                'report_id', NEW.id::text
            ),
            NEW.created_at
        );
    END IF;
    
    IF COALESCE(NEW.visits, 0) > 0 AND v_visit_rule_active THEN
        INSERT INTO public.gamification_activity_logs (
            user_id, organization_id, action_type, points_earned, reference_id,
            metadata, created_at
        ) VALUES (
            NEW.user_id, v_org_id, 'visit_scheduled', v_visit_points, NEW.id,
            jsonb_build_object(
                'count', NEW.visits,
                'unit_points', (SELECT points FROM public.gamification_rules WHERE organization_id = v_org_id AND action_type = 'visit_scheduled' LIMIT 1),
                'total_points', v_visit_points,
                'source', NEW.source,
                'description', NEW.description,
                'report_id', NEW.id::text,
                'manual_entry', true
            ),
            NEW.created_at
        );
        
        INSERT INTO public.gamification_events (
            user_id, organization_id, event_type, points_earned, source_id,
            source_module, metadata, created_at
        ) VALUES (
            NEW.user_id, v_org_id, 'visit_scheduled', v_visit_points, NEW.id,
            'prospecting_report',
            jsonb_build_object(
                'count', NEW.visits,
                'unit_points', (SELECT points FROM public.gamification_rules WHERE organization_id = v_org_id AND action_type = 'visit_scheduled' LIMIT 1),
                'total_points', v_visit_points,
                'source', NEW.source,
                'report_id', NEW.id::text
            ),
            NEW.created_at
        );
    END IF;
    
    IF COALESCE(NEW.proposals_sent, 0) > 0 AND v_proposal_rule_active THEN
        INSERT INTO public.gamification_activity_logs (
            user_id, organization_id, action_type, points_earned, reference_id,
            metadata, created_at
        ) VALUES (
            NEW.user_id, v_org_id, 'proposal_sent', v_proposal_points, NEW.id,
            jsonb_build_object(
                'count', NEW.proposals_sent,
                'unit_points', (SELECT points FROM public.gamification_rules WHERE organization_id = v_org_id AND action_type = 'proposal_sent' LIMIT 1),
                'total_points', v_proposal_points,
                'source', NEW.source,
                'description', NEW.description,
                'report_id', NEW.id::text,
                'manual_entry', true
            ),
            NEW.created_at
        );
        
        INSERT INTO public.gamification_events (
            user_id, organization_id, event_type, points_earned, source_id,
            source_module, metadata, created_at
        ) VALUES (
            NEW.user_id, v_org_id, 'proposal_sent', v_proposal_points, NEW.id,
            'prospecting_report',
            jsonb_build_object(
                'count', NEW.proposals_sent,
                'unit_points', (SELECT points FROM public.gamification_rules WHERE organization_id = v_org_id AND action_type = 'proposal_sent' LIMIT 1),
                'total_points', v_proposal_points,
                'source', NEW.source,
                'report_id', NEW.id::text
            ),
            NEW.created_at
        );
    END IF;
    
    -- Atualizar stats consolidadas
    INSERT INTO public.user_gamification_stats (
        user_id, organization_id, total_points, updated_at
    ) VALUES (
        NEW.user_id, v_org_id, v_total_points, NOW()
    ) ON CONFLICT (user_id) DO UPDATE SET 
        total_points = public.user_gamification_stats.total_points + EXCLUDED.total_points,
        updated_at = NOW();
    
    -- Atualizar pontos e XP do usuário (para compatibilidade com sistemas antigos)
    UPDATE public.users 
    SET points = COALESCE(points, 0) + v_total_points, 
        xp = COALESCE(xp, 0) + v_total_points
    WHERE id = NEW.user_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- A trigger já existe, basta garantir que está ativa
DROP TRIGGER IF EXISTS tr_prospecting_report_points ON public.prospecting_reports;
CREATE TRIGGER tr_prospecting_report_points
AFTER INSERT ON public.prospecting_reports
FOR EACH ROW
EXECUTE FUNCTION public.handle_prospecting_report_points();
