-- 1. Atualizar plan_value dos telecom_customers existentes baseado no plan_id vinculado
UPDATE telecom_customers tc
SET plan_value = sp.price
FROM service_plans sp
WHERE tc.plan_id = sp.id
  AND tc.plan_value IS NULL
  AND sp.price IS NOT NULL;

-- 2. Criar trigger para sincronizar plan_value automaticamente quando plan_id muda
CREATE OR REPLACE FUNCTION sync_telecom_customer_plan_value()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_price numeric;
BEGIN
  -- Se plan_id foi definido/alterado e plan_value não foi informado, preencher com o preço do plano
  IF NEW.plan_id IS NOT NULL AND (NEW.plan_value IS NULL OR TG_OP = 'INSERT' OR OLD.plan_id IS DISTINCT FROM NEW.plan_id) THEN
    -- Se o plan_id mudou, atualiza o plan_value com o preço do plano
    IF TG_OP = 'INSERT' OR OLD.plan_id IS DISTINCT FROM NEW.plan_id THEN
      SELECT price INTO v_plan_price
      FROM service_plans
      WHERE id = NEW.plan_id;
      
      IF v_plan_price IS NOT NULL AND NEW.plan_value IS NULL THEN
        NEW.plan_value := v_plan_price;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_plan_value_on_customer ON telecom_customers;
CREATE TRIGGER tr_sync_plan_value_on_customer
BEFORE INSERT OR UPDATE OF plan_id ON telecom_customers
FOR EACH ROW
EXECUTE FUNCTION sync_telecom_customer_plan_value();