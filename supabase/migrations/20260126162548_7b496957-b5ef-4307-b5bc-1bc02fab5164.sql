-- Function to execute stage automations when a lead enters a stage
CREATE OR REPLACE FUNCTION public.execute_stage_automations()
RETURNS TRIGGER AS $$
DECLARE
  v_automation RECORD;
  v_action_config JSONB;
BEGIN
  -- Only trigger on stage_id change (UPDATE) or INSERT with stage_id
  IF TG_OP = 'INSERT' THEN
    IF NEW.stage_id IS NULL THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.stage_id IS NOT DISTINCT FROM NEW.stage_id THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Find active automations for this stage with trigger_type 'on_enter'
  FOR v_automation IN
    SELECT * FROM public.stage_automations
    WHERE stage_id = NEW.stage_id
      AND organization_id = NEW.organization_id
      AND is_active = true
      AND trigger_type = 'on_enter'
  LOOP
    v_action_config := COALESCE(v_automation.action_config::jsonb, '{}'::jsonb);
    
    -- Execute based on automation_type
    CASE v_automation.automation_type
      -- Change deal status
      WHEN 'change_deal_status_on_enter' THEN
        DECLARE
          v_new_status TEXT;
        BEGIN
          v_new_status := v_action_config->>'deal_status';
          IF v_new_status IS NOT NULL AND v_new_status IN ('open', 'won', 'lost') THEN
            NEW.deal_status := v_new_status;
            -- Set timestamps
            IF v_new_status = 'won' THEN
              NEW.won_at := NOW();
              NEW.lost_at := NULL;
            ELSIF v_new_status = 'lost' THEN
              NEW.lost_at := NOW();
              NEW.won_at := NULL;
            ELSE
              NEW.won_at := NULL;
              NEW.lost_at := NULL;
              NEW.lost_reason := NULL;
            END IF;
            
            -- Log activity
            INSERT INTO public.activities (lead_id, user_id, type, content)
            VALUES (
              NEW.id,
              NEW.assigned_user_id,
              'status_change',
              'Status alterado automaticamente para ' || 
              CASE v_new_status 
                WHEN 'won' THEN 'Ganho' 
                WHEN 'lost' THEN 'Perdido' 
                ELSE 'Aberto' 
              END || ' (automação)'
            );
          END IF;
        END;
      
      -- Change assignee
      WHEN 'change_assignee_on_enter' THEN
        DECLARE
          v_target_user_id UUID;
        BEGIN
          v_target_user_id := (v_action_config->>'target_user_id')::UUID;
          IF v_target_user_id IS NOT NULL THEN
            NEW.assigned_user_id := v_target_user_id;
            
            -- Log activity
            INSERT INTO public.activities (lead_id, user_id, type, content)
            VALUES (
              NEW.id,
              v_target_user_id,
              'assignment',
              'Responsável alterado automaticamente (automação de estágio)'
            );
          END IF;
        END;
      
      ELSE
        -- Other automation types (send_whatsapp, move_after_inactivity, etc.)
        -- These are handled by scheduled jobs, not on-enter triggers
        NULL;
    END CASE;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for stage automations
DROP TRIGGER IF EXISTS trigger_execute_stage_automations ON public.leads;
CREATE TRIGGER trigger_execute_stage_automations
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.execute_stage_automations();