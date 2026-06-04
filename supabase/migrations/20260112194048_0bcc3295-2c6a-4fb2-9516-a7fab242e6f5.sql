-- Function to create a notification
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id UUID,
  p_organization_id UUID,
  p_title TEXT,
  p_content TEXT DEFAULT NULL,
  p_type TEXT DEFAULT 'info',
  p_lead_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO public.notifications (
    user_id,
    organization_id,
    title,
    content,
    type,
    lead_id,
    is_read
  ) VALUES (
    p_user_id,
    p_organization_id,
    p_title,
    p_content,
    p_type,
    p_lead_id,
    false
  )
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- Trigger function: Notify when a new lead is created
CREATE OR REPLACE FUNCTION public.notify_new_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_admin_users RECORD;
BEGIN
  -- If lead has an assigned user, notify them
  IF NEW.assigned_user_id IS NOT NULL THEN
    PERFORM public.create_notification(
      NEW.assigned_user_id,
      NEW.organization_id,
      'Novo lead recebido!',
      'O lead "' || NEW.name || '" foi adicionado ao pipeline.',
      'lead',
      NEW.id
    );
  ELSE
    -- Notify all admins in the organization
    FOR v_admin_users IN 
      SELECT id FROM public.users 
      WHERE organization_id = NEW.organization_id 
      AND role = 'admin'
    LOOP
      PERFORM public.create_notification(
        v_admin_users.id,
        NEW.organization_id,
        'Novo lead recebido!',
        'O lead "' || NEW.name || '" foi adicionado ao pipeline e precisa ser atribuído.',
        'lead',
        NEW.id
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for new leads
DROP TRIGGER IF EXISTS trigger_notify_new_lead ON public.leads;
CREATE TRIGGER trigger_notify_new_lead
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_lead();

-- Trigger function: Notify when lead is assigned to a user
CREATE OR REPLACE FUNCTION public.notify_lead_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger if assigned_user_id changed and new value is not null
  IF NEW.assigned_user_id IS NOT NULL AND 
     (OLD.assigned_user_id IS NULL OR OLD.assigned_user_id != NEW.assigned_user_id) THEN
    PERFORM public.create_notification(
      NEW.assigned_user_id,
      NEW.organization_id,
      'Lead atribuído a você!',
      'O lead "' || NEW.name || '" foi atribuído a você.',
      'lead',
      NEW.id
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for lead assignment
DROP TRIGGER IF EXISTS trigger_notify_lead_assigned ON public.leads;
CREATE TRIGGER trigger_notify_lead_assigned
  AFTER UPDATE OF assigned_user_id ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_lead_assigned();

-- Trigger function: Notify when lead changes stage
CREATE OR REPLACE FUNCTION public.notify_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_stage_name TEXT;
  v_new_stage_name TEXT;
BEGIN
  -- Only trigger if stage_id changed
  IF NEW.stage_id IS NOT NULL AND OLD.stage_id IS NOT NULL AND NEW.stage_id != OLD.stage_id THEN
    -- Get stage names
    SELECT name INTO v_old_stage_name FROM public.stages WHERE id = OLD.stage_id;
    SELECT name INTO v_new_stage_name FROM public.stages WHERE id = NEW.stage_id;
    
    -- Notify assigned user if exists
    IF NEW.assigned_user_id IS NOT NULL THEN
      PERFORM public.create_notification(
        NEW.assigned_user_id,
        NEW.organization_id,
        'Lead movido de estágio',
        'O lead "' || NEW.name || '" foi movido de "' || COALESCE(v_old_stage_name, 'N/A') || '" para "' || COALESCE(v_new_stage_name, 'N/A') || '".',
        'lead',
        NEW.id
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for stage change
DROP TRIGGER IF EXISTS trigger_notify_stage_change ON public.leads;
CREATE TRIGGER trigger_notify_stage_change
  AFTER UPDATE OF stage_id ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_stage_change();

-- Trigger function: Notify when schedule event is created
CREATE OR REPLACE FUNCTION public.notify_schedule_event_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_name TEXT;
  v_event_time TEXT;
BEGIN
  -- Get lead name if exists
  IF NEW.lead_id IS NOT NULL THEN
    SELECT name INTO v_lead_name FROM public.leads WHERE id = NEW.lead_id;
  END IF;
  
  -- Format event time
  v_event_time := to_char(NEW.start_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY às HH24:MI');
  
  -- Notify the assigned user
  PERFORM public.create_notification(
    NEW.user_id,
    NEW.organization_id,
    'Atividade agendada',
    NEW.title || ' - ' || v_event_time || CASE WHEN v_lead_name IS NOT NULL THEN ' - Lead: ' || v_lead_name ELSE '' END,
    'task',
    NEW.lead_id
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger for schedule event creation
DROP TRIGGER IF EXISTS trigger_notify_schedule_event_created ON public.schedule_events;
CREATE TRIGGER trigger_notify_schedule_event_created
  AFTER INSERT ON public.schedule_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_schedule_event_created();

-- Add notification_sent column to schedule_events to track reminders
ALTER TABLE public.schedule_events 
ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reminder_5min_sent BOOLEAN DEFAULT false;

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;