-- Corrigir execute_stage_automations removendo INSERT INTO activities
-- O log será feito pelo trigger log_lead_activity quando houver UPDATE
CREATE OR REPLACE FUNCTION public.execute_stage_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_automation RECORD;
  v_action_config JSONB;
  v_new_status TEXT;
  v_target_user_id UUID;
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
    
    -- Skip if action_config is empty for automations that require it
    IF v_automation.automation_type IN ('change_deal_status_on_enter', 'change_assignee_on_enter') 
       AND (v_action_config IS NULL OR v_action_config = '{}'::jsonb) THEN
      CONTINUE; -- Skip this automation, it's misconfigured
    END IF;
    
    -- Execute based on automation_type
    IF v_automation.automation_type = 'change_deal_status_on_enter' THEN
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
        -- NÃO inserir em activities aqui - o trigger log_lead_activity faz isso
      END IF;
    
    ELSIF v_automation.automation_type = 'change_assignee_on_enter' THEN
      v_target_user_id := (v_action_config->>'target_user_id')::UUID;
      IF v_target_user_id IS NOT NULL THEN
        NEW.assigned_user_id := v_target_user_id;
        -- NÃO inserir em activities aqui - o trigger log_lead_activity faz isso
      END IF;
    END IF;
    -- Other automation types are handled by scheduled jobs
  END LOOP;

  RETURN NEW;
END;
$function$;