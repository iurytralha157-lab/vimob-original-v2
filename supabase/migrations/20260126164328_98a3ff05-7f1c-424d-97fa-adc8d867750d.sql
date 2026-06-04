-- Create or replace the trigger to execute stage automations on lead insert/update
DROP TRIGGER IF EXISTS trigger_execute_stage_automations ON public.leads;

CREATE TRIGGER trigger_execute_stage_automations
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.execute_stage_automations();