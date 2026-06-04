-- Update notify_new_lead function to filter by user role
CREATE OR REPLACE FUNCTION public.notify_new_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_notified_users UUID[] := ARRAY[]::UUID[];
BEGIN
  -- 1. Always notify the assigned user first
  IF NEW.assigned_user_id IS NOT NULL THEN
    PERFORM public.create_notification(
      NEW.assigned_user_id,
      NEW.organization_id,
      'Novo lead recebido!',
      'O lead "' || NEW.name || '" foi atribuído a você.',
      'lead',
      NEW.id
    );
    v_notified_users := array_append(v_notified_users, NEW.assigned_user_id);
  END IF;
  
  -- 2. Notify team leaders of the assigned user's team (if any)
  IF NEW.assigned_user_id IS NOT NULL THEN
    FOR v_user IN 
      SELECT DISTINCT tm.user_id 
      FROM public.team_members tm
      INNER JOIN public.team_members tm2 ON tm.team_id = tm2.team_id
      WHERE tm2.user_id = NEW.assigned_user_id
      AND tm.is_leader = true
      AND tm.user_id != NEW.assigned_user_id
      AND NOT (tm.user_id = ANY(v_notified_users))
    LOOP
      PERFORM public.create_notification(
        v_user.user_id,
        NEW.organization_id,
        'Novo lead na equipe!',
        'O lead "' || NEW.name || '" foi atribuído a um membro da sua equipe.',
        'lead',
        NEW.id
      );
      v_notified_users := array_append(v_notified_users, v_user.user_id);
    END LOOP;
  END IF;
  
  -- 3. Notify all admins (organization managers) who haven't been notified yet
  FOR v_user IN 
    SELECT id FROM public.users 
    WHERE organization_id = NEW.organization_id 
    AND role = 'admin'
    AND NOT (id = ANY(v_notified_users))
  LOOP
    PERFORM public.create_notification(
      v_user.id,
      NEW.organization_id,
      'Novo lead recebido!',
      'O lead "' || NEW.name || '" foi adicionado ao pipeline.',
      'lead',
      NEW.id
    );
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Update notify_lead_assigned to only notify the assigned user
CREATE OR REPLACE FUNCTION public.notify_lead_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_notified_users UUID[] := ARRAY[]::UUID[];
BEGIN
  -- Only trigger if assigned_user_id changed and new value is not null
  IF NEW.assigned_user_id IS NOT NULL AND 
     (OLD.assigned_user_id IS NULL OR OLD.assigned_user_id != NEW.assigned_user_id) THEN
    
    -- 1. Notify the newly assigned user
    PERFORM public.create_notification(
      NEW.assigned_user_id,
      NEW.organization_id,
      'Lead atribuído a você!',
      'O lead "' || NEW.name || '" foi atribuído a você.',
      'lead',
      NEW.id
    );
    v_notified_users := array_append(v_notified_users, NEW.assigned_user_id);
    
    -- 2. Notify team leaders of the assigned user
    FOR v_user IN 
      SELECT DISTINCT tm.user_id 
      FROM public.team_members tm
      INNER JOIN public.team_members tm2 ON tm.team_id = tm2.team_id
      WHERE tm2.user_id = NEW.assigned_user_id
      AND tm.is_leader = true
      AND tm.user_id != NEW.assigned_user_id
      AND NOT (tm.user_id = ANY(v_notified_users))
    LOOP
      PERFORM public.create_notification(
        v_user.user_id,
        NEW.organization_id,
        'Lead atribuído na equipe!',
        'O lead "' || NEW.name || '" foi atribuído a um membro da sua equipe.',
        'lead',
        NEW.id
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update notify_stage_change to respect user hierarchy
CREATE OR REPLACE FUNCTION public.notify_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_stage_name TEXT;
  v_new_stage_name TEXT;
  v_user RECORD;
  v_notified_users UUID[] := ARRAY[]::UUID[];
BEGIN
  -- Only trigger if stage_id changed
  IF NEW.stage_id IS NOT NULL AND OLD.stage_id IS NOT NULL AND NEW.stage_id != OLD.stage_id THEN
    -- Get stage names
    SELECT name INTO v_old_stage_name FROM public.stages WHERE id = OLD.stage_id;
    SELECT name INTO v_new_stage_name FROM public.stages WHERE id = NEW.stage_id;
    
    -- 1. Notify assigned user if exists
    IF NEW.assigned_user_id IS NOT NULL THEN
      PERFORM public.create_notification(
        NEW.assigned_user_id,
        NEW.organization_id,
        'Lead movido de estágio',
        'O lead "' || NEW.name || '" foi movido de "' || COALESCE(v_old_stage_name, 'N/A') || '" para "' || COALESCE(v_new_stage_name, 'N/A') || '".',
        'lead',
        NEW.id
      );
      v_notified_users := array_append(v_notified_users, NEW.assigned_user_id);
    END IF;
    
    -- 2. Notify team leaders of the assigned user
    IF NEW.assigned_user_id IS NOT NULL THEN
      FOR v_user IN 
        SELECT DISTINCT tm.user_id 
        FROM public.team_members tm
        INNER JOIN public.team_members tm2 ON tm.team_id = tm2.team_id
        WHERE tm2.user_id = NEW.assigned_user_id
        AND tm.is_leader = true
        AND tm.user_id != NEW.assigned_user_id
        AND NOT (tm.user_id = ANY(v_notified_users))
      LOOP
        PERFORM public.create_notification(
          v_user.user_id,
          NEW.organization_id,
          'Lead movido de estágio',
          'O lead "' || NEW.name || '" foi movido de "' || COALESCE(v_old_stage_name, 'N/A') || '" para "' || COALESCE(v_new_stage_name, 'N/A') || '".',
          'lead',
          NEW.id
        );
      END LOOP;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;