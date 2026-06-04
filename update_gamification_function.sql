
CREATE OR REPLACE FUNCTION public.handle_activity_gamification()
RETURNS TRIGGER AS $$
DECLARE
    v_points INTEGER := 0;
    v_action_type TEXT;
    v_org_id UUID;
    v_rule_points INTEGER;
    v_to_stage TEXT;
    v_multiplier INTEGER := 1;
BEGIN
    -- Get organization ID
    -- We try to get it from users table based on user_id
    SELECT organization_id INTO v_org_id FROM public.users WHERE id = NEW.user_id;
    
    IF v_org_id IS NULL THEN 
        -- Fallback: check if organization_id is in NEW (for tables that have it like prospecting_reports)
        BEGIN
            v_org_id := NEW.organization_id;
        EXCEPTION WHEN others THEN
            v_org_id := NULL;
        END;
    END IF;

    IF v_org_id IS NULL THEN RETURN NEW; END IF;

    -- Mapping CRM types to Gamification types
    IF TG_TABLE_NAME = 'activities' THEN
        -- Mapping logic
        IF NEW.type IN ('call', 'call_made') THEN 
            v_action_type := 'call_made';
            -- Check if it was "answered" (contato efetivo)
            IF NEW.metadata->>'outcome' = 'answered' THEN
                v_action_type := 'contact_made';
            END IF;
        ELSIF NEW.type IN ('message', 'message_sent', 'whatsapp_message_sent') THEN 
            v_action_type := 'message_sent';
            -- Check if it was "replied" (contato efetivo)
            IF NEW.metadata->>'outcome' = 'replied' THEN
                v_action_type := 'contact_made';
            END IF;
        ELSIF NEW.type IN ('lead_created', 'lead_created_manual') THEN 
            v_action_type := 'lead_created_manual';
        ELSIF NEW.type = 'property_created' THEN 
            v_action_type := 'property_created';
        ELSIF NEW.type = 'sale_closed' THEN 
            v_action_type := 'sale_closed';
        ELSIF NEW.type IN ('visit_scheduled', 'meeting_scheduled') THEN 
            v_action_type := 'visit_scheduled';
        ELSIF NEW.type IN ('visit_confirmed', 'meeting_held', 'visit_realized') THEN 
            v_action_type := 'visit_confirmed';
        ELSIF NEW.type = 'proposal_sent' THEN 
            v_action_type := 'proposal_sent';
        ELSIF NEW.type = 'contact_made' THEN 
            v_action_type := 'contact_made';
        ELSIF NEW.type IN ('stage_change', 'status_change') THEN
            -- Detect sale from status change or stage name
            IF NEW.metadata->>'new_status' = 'won' 
               OR NEW.metadata->>'to_stage' ILIKE ANY (ARRAY['%Venda%', '%Ganh%', '%Fechamento%', '%Won%']) 
               OR NEW.metadata->>'new_stage_name' ILIKE ANY (ARRAY['%Venda%', '%Ganh%', '%Fechamento%', '%Won%'])
            THEN 
                v_action_type := 'sale_closed';
            ELSIF NEW.metadata->>'new_stage_name' ILIKE '%Proposta%' OR NEW.metadata->>'to_stage' ILIKE '%Proposta%' THEN 
                v_action_type := 'proposal_sent';
            ELSIF NEW.metadata->>'new_stage_name' ILIKE '%Contrato%' OR NEW.metadata->>'to_stage' ILIKE '%Contrato%' THEN 
                v_action_type := 'contract_signed';
            ELSIF (NEW.metadata->>'new_stage_name' ILIKE '%Visita%' OR NEW.metadata->>'to_stage' ILIKE '%Visita%') 
                  AND (NEW.metadata->>'new_stage_name' ILIKE ANY (ARRAY['%Realizada%', '%Confirmada%']) 
                       OR NEW.metadata->>'to_stage' ILIKE ANY (ARRAY['%Realizada%', '%Confirmada%'])) THEN 
                v_action_type := 'visit_confirmed';
            ELSIF (NEW.metadata->>'new_stage_name' ILIKE '%Visita%' OR NEW.metadata->>'to_stage' ILIKE '%Visita%') 
                  AND (NEW.metadata->>'new_stage_name' ILIKE '%Agendada%' OR NEW.metadata->>'to_stage' ILIKE '%Agendada%') THEN 
                v_action_type := 'visit_scheduled';
            ELSE RETURN NEW; END IF;
        ELSE RETURN NEW; END IF;
        
    ELSIF TG_TABLE_NAME = 'prospecting_reports' THEN
        v_action_type := 'prospecting_report';
    ELSIF TG_TABLE_NAME = 'missions' THEN
        v_action_type := 'mission_bonus';
    ELSE
        RETURN NEW;
    END IF;

    -- Fetch points from organization settings
    SELECT points INTO v_rule_points FROM public.gamification_rules 
    WHERE organization_id = v_org_id AND action_type = v_action_type AND is_active = true LIMIT 1;

    -- Fallback points if no rule is found
    IF v_rule_points IS NULL THEN
        CASE v_action_type
            WHEN 'sale_closed' THEN v_rule_points := 100;
            WHEN 'contract_signed' THEN v_rule_points := 50;
            WHEN 'proposal_sent' THEN v_rule_points := 20;
            WHEN 'visit_confirmed' THEN v_rule_points := 15;
            WHEN 'visit_scheduled' THEN v_rule_points := 10;
            WHEN 'contact_made' THEN v_rule_points := 5;
            WHEN 'lead_created_manual' THEN v_rule_points := 5;
            WHEN 'property_created' THEN v_rule_points := 10;
            WHEN 'call_made' THEN v_rule_points := 1;
            WHEN 'message_sent' THEN v_rule_points := 1;
            WHEN 'prospecting_report' THEN v_rule_points := 1;
            ELSE v_rule_points := 5;
        END CASE;
    END IF;

    -- Special handling for prospecting reports to multiply points
    IF v_action_type = 'prospecting_report' THEN
        v_points := (COALESCE(NEW.calls, 0) * 1) + 
                    (COALESCE(NEW.messages, 0) * 1) + 
                    (COALESCE(NEW.contacts, 0) * 3);
        
        -- Fallback to rule points if result is 0 but we want to credit something
        IF v_points = 0 THEN v_points := v_rule_points; END IF;
    ELSE
        v_points := v_rule_points * v_multiplier;
    END IF;

    IF v_points <= 0 THEN RETURN NEW; END IF;

    -- Record the event in logs
    INSERT INTO public.gamification_activity_logs (user_id, organization_id, action_type, points_earned, reference_id, metadata)
    VALUES (NEW.user_id, v_org_id, v_action_type, v_points, NEW.id, NEW.metadata);

    INSERT INTO public.gamification_events (user_id, organization_id, event_type, points_earned, source_id, metadata)
    VALUES (NEW.user_id, v_org_id, v_action_type, v_points, NEW.id, NEW.metadata);

    -- Update total points
    INSERT INTO public.user_gamification_stats (user_id, organization_id, total_points, updated_at)
    VALUES (NEW.user_id, v_org_id, v_points, now())
    ON CONFLICT (user_id) DO UPDATE SET total_points = public.user_gamification_stats.total_points + v_points, updated_at = now();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
