-- Função para criar comissão e receivable automaticamente quando deal_status muda para 'won'
CREATE OR REPLACE FUNCTION create_commission_on_won()
RETURNS TRIGGER AS $$
DECLARE
  v_commission_percentage numeric;
  v_commission_amount numeric;
  v_property_commission numeric;
  v_org_commission numeric;
BEGIN
  -- Só executa se deal_status mudou para 'won' e tem valor_interesse
  IF NEW.deal_status = 'won' 
     AND (OLD.deal_status IS NULL OR OLD.deal_status != 'won')
     AND NEW.valor_interesse > 0 THEN
    
    -- Verificar se já existe comissão para este lead
    IF NOT EXISTS (SELECT 1 FROM commissions WHERE lead_id = NEW.id) THEN
      
      -- Buscar percentual do imóvel
      SELECT commission_percentage INTO v_property_commission
      FROM properties WHERE id = NEW.property_id;
      
      -- Buscar percentual da organização
      SELECT default_commission_percentage INTO v_org_commission
      FROM organizations WHERE id = NEW.organization_id;
      
      -- Fallback chain: lead -> property -> organization -> 5%
      v_commission_percentage := COALESCE(
        NULLIF(NEW.commission_percentage, 0),
        NULLIF(v_property_commission, 0),
        NULLIF(v_org_commission, 0),
        5.0
      );
      
      v_commission_amount := NEW.valor_interesse * (v_commission_percentage / 100);
      
      -- Criar comissão
      INSERT INTO commissions (
        organization_id, lead_id, user_id, property_id,
        base_value, amount, percentage, status, notes
      ) VALUES (
        NEW.organization_id, NEW.id, NEW.assigned_user_id, NEW.property_id,
        NEW.valor_interesse, v_commission_amount, v_commission_percentage,
        'forecast', 'Comissão gerada automaticamente'
      );
    END IF;
    
    -- Verificar se já existe receivable para este lead
    IF NOT EXISTS (
      SELECT 1 FROM financial_entries 
      WHERE lead_id = NEW.id AND type = 'receivable'
    ) THEN
      -- Criar conta a receber
      INSERT INTO financial_entries (
        organization_id, lead_id, type, amount, 
        due_date, status, description
      ) VALUES (
        NEW.organization_id, NEW.id, 'receivable', NEW.valor_interesse,
        (CURRENT_DATE + INTERVAL '30 days')::date,
        'pending', 'Venda - ' || NEW.name
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger que dispara após update em leads quando deal_status muda para 'won'
DROP TRIGGER IF EXISTS trigger_create_commission_on_won ON leads;
CREATE TRIGGER trigger_create_commission_on_won
AFTER UPDATE ON leads
FOR EACH ROW
WHEN (NEW.deal_status = 'won' AND OLD.deal_status IS DISTINCT FROM 'won')
EXECUTE FUNCTION create_commission_on_won();