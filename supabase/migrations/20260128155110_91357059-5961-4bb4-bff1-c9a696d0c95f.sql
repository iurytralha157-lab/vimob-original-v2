-- 1. Dropar função antiga (a versão trigger sem parâmetros que causa conflito)
DROP FUNCTION IF EXISTS public.handle_lead_intake() CASCADE;

-- 2. Criar função trigger dedicada que chama a versão correta
CREATE OR REPLACE FUNCTION public.trigger_handle_lead_intake()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN 
  -- Só aciona se o lead não tiver responsável atribuído
  IF NEW.assigned_user_id IS NULL THEN 
    v_result := public.handle_lead_intake(NEW.id); 
  END IF; 
  RETURN NEW; 
END; 
$$;

-- 3. Recriar trigger apontando para a nova função
DROP TRIGGER IF EXISTS trigger_lead_intake ON public.leads;
CREATE TRIGGER trigger_lead_intake 
  AFTER INSERT ON public.leads 
  FOR EACH ROW 
  EXECUTE FUNCTION public.trigger_handle_lead_intake();