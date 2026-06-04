-- Atualizar o trigger para NÃO criar atividade no INSERT
-- Isso evita race condition quando o lead é criado via webhook
CREATE OR REPLACE FUNCTION public.log_lead_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_stage_name TEXT;
  v_new_stage_name TEXT;
  v_old_assignee_name TEXT;
  v_new_assignee_name TEXT;
BEGIN
  -- On INSERT: NÃO criar atividade aqui para evitar race condition
  -- A atividade de criação será registrada separadamente quando necessário
  IF TG_OP = 'INSERT' THEN
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
        CASE NEW.deal_status
          WHEN 'won' THEN 'Status alterado para Ganho'
          WHEN 'lost' THEN 'Status alterado para Perdido'
          ELSE 'Status alterado para Aberto'
        END,
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
$function$;