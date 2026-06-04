-- Add new rule types to gamification_rules
INSERT INTO public.gamification_rules (organization_id, action_type, points)
SELECT id, 'lead_created_manual', 5 FROM public.organizations
ON CONFLICT (organization_id, action_type) DO NOTHING;

INSERT INTO public.gamification_rules (organization_id, action_type, points)
SELECT id, 'property_created', 50 FROM public.organizations
ON CONFLICT (organization_id, action_type) DO NOTHING;

-- Update handle_activity_gamification function to handle new activities
CREATE OR REPLACE FUNCTION public.handle_activity_gamification()
RETURNS TRIGGER AS $$
DECLARE
    v_points INTEGER := 0;
    v_action_type TEXT;
    v_org_id UUID;
BEGIN
    -- Determine action type based on activity type
    IF NEW.type = 'call' THEN
        v_action_type := 'call_made';
    ELSIF NEW.type = 'message' THEN
        v_action_type := 'message_sent';
    ELSIF NEW.type = 'stage_change' THEN
        -- Check if it's a visit
        IF (NEW.metadata->>'new_stage_name') ILIKE '%visita%' THEN
            v_action_type := 'visit_scheduled';
        ELSE
            RETURN NEW;
        END IF;
    ELSIF NEW.type = 'status_change' AND NEW.metadata->>'new_status' = 'won' THEN
        v_action_type := 'sale_closed';
    ELSIF NEW.type = 'lead_created' AND NEW.metadata->>'source' = 'manual' THEN
        v_action_type := 'lead_created_manual';
    ELSIF NEW.type = 'property_created' THEN
        v_action_type := 'property_created';
    ELSE
        RETURN NEW;
    END IF;

    -- Get organization_id from user profile
    SELECT organization_id INTO v_org_id FROM public.profiles WHERE id = NEW.user_id;
    
    -- If profile org not found, try from metadata or leave if it fails later
    IF v_org_id IS NULL AND NEW.metadata->>'organization_id' IS NOT NULL THEN
        v_org_id := (NEW.metadata->>'organization_id')::uuid;
    END IF;

    IF v_org_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get points from rules
    SELECT points INTO v_points FROM public.gamification_rules WHERE organization_id = v_org_id AND action_type = v_action_type AND is_active = true;

    IF v_points IS NULL OR v_points <= 0 THEN
        -- Fallback to defaults
        IF v_action_type = 'call_made' THEN v_points := 1;
        ELSIF v_action_type = 'message_sent' THEN v_points := 1;
        ELSIF v_action_type = 'visit_scheduled' THEN v_points := 30;
        ELSIF v_action_type = 'sale_closed' THEN v_points := 100;
        ELSIF v_action_type = 'lead_created_manual' THEN v_points := 5;
        ELSIF v_action_type = 'property_created' THEN v_points := 50;
        ELSE RETURN NEW;
        END IF;
    END IF;

    -- Insert log
    INSERT INTO public.gamification_activity_logs (user_id, organization_id, action_type, points_earned, reference_id, metadata)
    VALUES (NEW.user_id, v_org_id, v_action_type, v_points, NEW.id, NEW.metadata);

    -- Update user stats
    INSERT INTO public.user_gamification_stats (user_id, organization_id, total_points, updated_at)
    VALUES (NEW.user_id, v_org_id, v_points, now())
    ON CONFLICT (user_id) DO UPDATE
    SET total_points = public.user_gamification_stats.total_points + v_points,
        updated_at = now();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
