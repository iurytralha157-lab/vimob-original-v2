-- Create trigger function to automatically log activities for lead lifecycle events
CREATE OR REPLACE FUNCTION public.log_lead_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_old_stage_name TEXT;
  v_new_stage_name TEXT;
  v_old_assignee_name TEXT;
  v_new_assignee_name TEXT;
BEGIN
  -- On INSERT: Log lead creation
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activities (lead_id, user_id, type, content, metadata)
    VALUES (
      NEW.id,
      NEW.assigned_user_id, -- Use assigned_user_id since created_by doesn't exist
      'lead_created',
      'Lead "' || COALESCE(NEW.name, 'Sem nome') || '" foi criado',
      jsonb_build_object('source', COALESCE(NEW.source, 'manual'))
    );
    
    RETURN NEW;
  END IF;
  
  -- On UPDATE: Log stage changes and assignee changes
  IF TG_OP = 'UPDATE' THEN
    -- Check if stage changed
    IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
      -- Get stage names
      SELECT name INTO v_old_stage_name FROM public.stages WHERE id = OLD.stage_id;
      SELECT name INTO v_new_stage_name FROM public.stages WHERE id = NEW.stage_id;
      
      INSERT INTO public.activities (lead_id, user_id, type, content, metadata)
      VALUES (
        NEW.id,
        NEW.assigned_user_id,
        'stage_change',
        'Movido de "' || COALESCE(v_old_stage_name, 'Desconhecido') || '" para "' || COALESCE(v_new_stage_name, 'Desconhecido') || '"',
        jsonb_build_object(
          'from_stage', v_old_stage_name,
          'to_stage', v_new_stage_name,
          'from_stage_id', OLD.stage_id,
          'to_stage_id', NEW.stage_id
        )
      );
    END IF;
    
    -- Check if assignee changed
    IF OLD.assigned_user_id IS DISTINCT FROM NEW.assigned_user_id THEN
      -- Get assignee names
      SELECT name INTO v_old_assignee_name FROM public.users WHERE id = OLD.assigned_user_id;
      SELECT name INTO v_new_assignee_name FROM public.users WHERE id = NEW.assigned_user_id;
      
      INSERT INTO public.activities (lead_id, user_id, type, content, metadata)
      VALUES (
        NEW.id,
        NEW.assigned_user_id,
        'assignee_changed',
        CASE 
          WHEN NEW.assigned_user_id IS NULL THEN 'Responsável removido'
          WHEN OLD.assigned_user_id IS NULL THEN 'Atribuído para ' || COALESCE(v_new_assignee_name, 'Desconhecido')
          ELSE 'Responsável alterado de ' || COALESCE(v_old_assignee_name, 'Desconhecido') || ' para ' || COALESCE(v_new_assignee_name, 'Desconhecido')
        END,
        jsonb_build_object(
          'from_user_id', OLD.assigned_user_id,
          'to_user_id', NEW.assigned_user_id,
          'from_user_name', v_old_assignee_name,
          'to_user_name', v_new_assignee_name
        )
      );
    END IF;
    
    -- Check if deal_status changed
    IF OLD.deal_status IS DISTINCT FROM NEW.deal_status THEN
      INSERT INTO public.activities (lead_id, user_id, type, content, metadata)
      VALUES (
        NEW.id,
        NEW.assigned_user_id,
        'status_change',
        'Status alterado de ' || COALESCE(OLD.deal_status, 'Nenhum') || ' para ' || COALESCE(NEW.deal_status, 'Nenhum'),
        jsonb_build_object(
          'from_status', OLD.deal_status,
          'to_status', NEW.deal_status
        )
      );
    END IF;
    
    RETURN NEW;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create the trigger on leads table (AFTER to not interfere with other triggers)
DROP TRIGGER IF EXISTS trigger_log_lead_activity ON public.leads;
CREATE TRIGGER trigger_log_lead_activity
  AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.log_lead_activity();

-- Backfill: Create "lead_created" activities for existing leads that don't have any activity
INSERT INTO public.activities (lead_id, user_id, type, content, metadata, created_at)
SELECT 
  l.id,
  l.assigned_user_id,
  'lead_created',
  'Lead "' || COALESCE(l.name, 'Sem nome') || '" foi criado',
  jsonb_build_object('source', COALESCE(l.source, 'unknown'), 'backfilled', true),
  l.created_at
FROM public.leads l
WHERE NOT EXISTS (
  SELECT 1 FROM public.activities a 
  WHERE a.lead_id = l.id 
  AND a.type = 'lead_created'
);