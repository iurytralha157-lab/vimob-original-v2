-- Recriar trigger para distribuição automática de leads

-- 1. Primeiro dropar a função trigger existente se houver conflito
DROP FUNCTION IF EXISTS public.trigger_handle_lead_intake() CASCADE;

-- 2. Criar função trigger que chama handle_lead_intake após inserção
CREATE OR REPLACE FUNCTION public.trigger_handle_lead_intake() 
RETURNS TRIGGER 
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

-- 3. Remover trigger se existir
DROP TRIGGER IF EXISTS trigger_lead_intake ON public.leads;

-- 4. Criar trigger AFTER INSERT
CREATE TRIGGER trigger_lead_intake 
  AFTER INSERT ON public.leads 
  FOR EACH ROW 
  EXECUTE FUNCTION public.trigger_handle_lead_intake();