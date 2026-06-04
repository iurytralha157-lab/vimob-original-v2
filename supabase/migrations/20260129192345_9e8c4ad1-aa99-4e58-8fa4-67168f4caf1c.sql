
-- 1. Atualizar seller_id dos telecom_customers existentes baseado no nome do lead
UPDATE telecom_customers tc
SET seller_id = subq.assigned_user_id
FROM (
  SELECT DISTINCT ON (l.name, l.organization_id) 
    l.name, 
    l.organization_id,
    l.assigned_user_id
  FROM leads l
  WHERE l.assigned_user_id IS NOT NULL
  ORDER BY l.name, l.organization_id, l.created_at DESC
) subq
WHERE tc.name = subq.name
  AND tc.organization_id = subq.organization_id
  AND tc.seller_id IS NULL
  AND subq.assigned_user_id IS NOT NULL;

-- 2. Criar trigger para sincronizar seller_id quando um telecom_customer é criado
CREATE OR REPLACE FUNCTION sync_telecom_customer_seller_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_assigned_user_id uuid;
BEGIN
  -- Se seller_id não foi definido, buscar do lead correspondente pelo nome
  IF NEW.seller_id IS NULL THEN
    SELECT assigned_user_id INTO v_lead_assigned_user_id
    FROM leads
    WHERE organization_id = NEW.organization_id
      AND name = NEW.name
      AND assigned_user_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF v_lead_assigned_user_id IS NOT NULL THEN
      NEW.seller_id := v_lead_assigned_user_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Criar trigger na tabela telecom_customers
DROP TRIGGER IF EXISTS tr_sync_seller_on_customer_insert ON telecom_customers;
CREATE TRIGGER tr_sync_seller_on_customer_insert
BEFORE INSERT ON telecom_customers
FOR EACH ROW
EXECUTE FUNCTION sync_telecom_customer_seller_on_insert();

-- 3. Criar trigger para sincronizar quando assigned_user_id do lead muda
CREATE OR REPLACE FUNCTION sync_lead_seller_to_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Quando assigned_user_id do lead muda, atualizar o seller_id do telecom_customer correspondente
  IF NEW.assigned_user_id IS NOT NULL AND 
     (OLD.assigned_user_id IS NULL OR OLD.assigned_user_id != NEW.assigned_user_id) THEN
    
    UPDATE telecom_customers
    SET seller_id = NEW.assigned_user_id
    WHERE organization_id = NEW.organization_id
      AND name = NEW.name;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_lead_seller_to_customer ON leads;
CREATE TRIGGER tr_sync_lead_seller_to_customer
AFTER UPDATE OF assigned_user_id ON leads
FOR EACH ROW
EXECUTE FUNCTION sync_lead_seller_to_customer();
