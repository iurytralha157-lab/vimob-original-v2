CREATE OR REPLACE FUNCTION public.handle_activity_gamification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points INTEGER;
  v_org_id UUID;
  v_module_enabled BOOLEAN;
BEGIN
  v_org_id := NEW.organization_id;

  -- Check module
  SELECT is_enabled INTO v_module_enabled 
  FROM public.organization_modules 
  WHERE organization_id = v_org_id AND module_name = 'gamification';

  IF v_module_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT points INTO v_points FROM public.gamification_rules
  WHERE action_key = NEW.type AND organization_id = v_org_id;

  IF v_points IS NOT NULL AND v_points > 0 THEN
    INSERT INTO public.gamification_events (user_id, organization_id, event_type, points_earned, source_module)
    VALUES (NEW.user_id, v_org_id, NEW.type, v_points, 'system');
    
    INSERT INTO public.gamification_activity_logs (user_id, organization_id, action_type, points_earned)
    VALUES (NEW.user_id, v_org_id, NEW.type, v_points);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_schedule_gamification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points INTEGER;
  v_org_id UUID;
  v_module_enabled BOOLEAN;
BEGIN
  v_org_id := NEW.organization_id;

  SELECT is_enabled INTO v_module_enabled 
  FROM public.organization_modules 
  WHERE organization_id = v_org_id AND module_name = 'gamification';

  IF v_module_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT points INTO v_points FROM public.gamification_rules
  WHERE action_key = 'meeting_scheduled' AND organization_id = v_org_id;

  IF v_points IS NOT NULL AND v_points > 0 THEN
    INSERT INTO public.gamification_events (user_id, organization_id, event_type, points_earned, source_module)
    VALUES (NEW.user_id, v_org_id, 'meeting_scheduled', v_points, 'system');
    
    INSERT INTO public.gamification_activity_logs (user_id, organization_id, action_type, points_earned)
    VALUES (NEW.user_id, v_org_id, 'meeting_scheduled', v_points);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_prospecting_report_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points INTEGER;
  v_org_id UUID;
  v_module_enabled BOOLEAN;
BEGIN
  v_org_id := NEW.organization_id;

  SELECT is_enabled INTO v_module_enabled 
  FROM public.organization_modules 
  WHERE organization_id = v_org_id AND module_name = 'gamification';

  IF v_module_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT points INTO v_points FROM public.gamification_rules
  WHERE action_key = 'prospecting_report' AND organization_id = v_org_id;

  IF v_points IS NOT NULL AND v_points > 0 THEN
    INSERT INTO public.gamification_events (user_id, organization_id, event_type, points_earned, source_module)
    VALUES (NEW.user_id, v_org_id, 'prospecting_report', v_points, 'system');
    
    INSERT INTO public.gamification_activity_logs (user_id, organization_id, action_type, points_earned)
    VALUES (NEW.user_id, v_org_id, 'prospecting_report', v_points);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
