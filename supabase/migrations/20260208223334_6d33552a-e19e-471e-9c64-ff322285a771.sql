-- Recriar a função de trigger sem esperar retorno JSONB
CREATE OR REPLACE FUNCTION trigger_handle_lead_intake()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN 
  -- Só aciona se o lead não tiver responsável atribuído
  IF NEW.assigned_user_id IS NULL THEN 
    PERFORM public.handle_lead_intake(NEW.id); 
  END IF; 
  RETURN NEW; 
END;
$$;

-- Garantir que o trigger existe e está correto
DROP TRIGGER IF EXISTS trigger_lead_intake ON leads;
CREATE TRIGGER trigger_lead_intake
  AFTER INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION trigger_handle_lead_intake();