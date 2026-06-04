-- ============================================================
-- FASE 2: Automatizações financeiras CRM imobiliário
-- Gera comissões automaticamente quando um contrato vira ativo
-- ============================================================

-- 1) Função que gera comissões previstas a partir de contract_brokers
CREATE OR REPLACE FUNCTION public.generate_commissions_for_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_broker RECORD;
  v_base   numeric;
BEGIN
  -- Só dispara quando o contrato vira active/signed (novo ou via update)
  IF (TG_OP = 'INSERT' AND NEW.status IN ('active','signed'))
     OR (TG_OP = 'UPDATE' AND NEW.status IN ('active','signed') AND COALESCE(OLD.status,'') <> NEW.status) THEN

    v_base := COALESCE(NEW.value, 0);
    IF v_base <= 0 THEN RETURN NEW; END IF;

    -- Evita duplicar: se já existem comissões para este contrato, sai
    IF EXISTS (SELECT 1 FROM public.commissions WHERE contract_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    -- Se há brokers vinculados, gera 1 comissão prevista por broker
    FOR v_broker IN
      SELECT user_id, commission_percentage
      FROM public.contract_brokers
      WHERE contract_id = NEW.id
    LOOP
      INSERT INTO public.commissions (
        organization_id, contract_id, lead_id, property_id,
        user_id, percentage, base_value, amount, calculated_value,
        status, forecast_date, notes
      ) VALUES (
        NEW.organization_id, NEW.id, NEW.lead_id, NEW.property_id,
        v_broker.user_id,
        COALESCE(v_broker.commission_percentage, NEW.commission_percentage, 0),
        v_base,
        ROUND(v_base * COALESCE(v_broker.commission_percentage, NEW.commission_percentage, 0) / 100.0, 2),
        ROUND(v_base * COALESCE(v_broker.commission_percentage, NEW.commission_percentage, 0) / 100.0, 2),
        'forecast',
        COALESCE(NEW.closing_date, NEW.signing_date, CURRENT_DATE),
        'Comissão prevista gerada automaticamente ao ativar contrato'
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_commissions_for_contract ON public.contracts;
CREATE TRIGGER trg_generate_commissions_for_contract
AFTER INSERT OR UPDATE OF status ON public.contracts
FOR EACH ROW
EXECUTE FUNCTION public.generate_commissions_for_contract();

-- 2) Quando um lançamento receivable é pago e está ligado a um contrato,
--    promove as comissões 'forecast' do contrato para 'pending' (liberadas).
CREATE OR REPLACE FUNCTION public.release_commissions_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'receivable'
     AND NEW.status = 'paid'
     AND COALESCE(OLD.status,'') <> 'paid'
     AND NEW.contract_id IS NOT NULL THEN

    UPDATE public.commissions
       SET status = 'pending',
           updated_at = now()
     WHERE contract_id = NEW.contract_id
       AND status = 'forecast';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_commissions_on_payment ON public.financial_entries;
CREATE TRIGGER trg_release_commissions_on_payment
AFTER UPDATE OF status ON public.financial_entries
FOR EACH ROW
EXECUTE FUNCTION public.release_commissions_on_payment();

-- 3) Índices para performance do dashboard
CREATE INDEX IF NOT EXISTS idx_financial_entries_org_status_due
  ON public.financial_entries (organization_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_financial_entries_org_status_paid
  ON public.financial_entries (organization_id, status, paid_date);
CREATE INDEX IF NOT EXISTS idx_commissions_org_status
  ON public.commissions (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_contracts_org_status
  ON public.contracts (organization_id, status);
