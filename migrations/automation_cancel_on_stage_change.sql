-- Run in the Supabase SQL Editor.
-- Cancels running/waiting automation executions when a lead's stage changes,
-- but only for automations that opted in via trigger_config.cancel_on_stage_change = true.
-- Designed for stage-change-triggered follow-ups so they stop disrupting the lead's new flow.

CREATE OR REPLACE FUNCTION public.cancel_automations_on_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    WITH targets AS (
      SELECT ae.id, ae.automation_id, a.name AS automation_name
      FROM automation_executions ae
      JOIN automations a ON a.id = ae.automation_id
      WHERE ae.lead_id = NEW.id
        AND ae.status IN ('running', 'waiting')
        AND COALESCE((a.trigger_config ->> 'cancel_on_stage_change')::boolean, false) = true
    ), upd AS (
      UPDATE automation_executions ae
      SET status = 'cancelled',
          completed_at = now(),
          error_message = 'Cancelado: lead mudou de estágio'
      FROM targets t
      WHERE ae.id = t.id
      RETURNING ae.id, t.automation_name
    )
    INSERT INTO activities (lead_id, type, content, metadata, user_id)
    SELECT NEW.id,
           'automation_cancelled_stage_change',
           'Automação "' || COALESCE(upd.automation_name, '') || '" cancelada: lead mudou de estágio',
           jsonb_build_object(
             'is_automation', true,
             'execution_id', upd.id,
             'from_stage', OLD.stage_id,
             'to_stage', NEW.stage_id
           ),
           NULL
    FROM upd;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancel_automations_on_stage_change ON public.leads;
CREATE TRIGGER trg_cancel_automations_on_stage_change
AFTER UPDATE OF stage_id ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.cancel_automations_on_stage_change();
