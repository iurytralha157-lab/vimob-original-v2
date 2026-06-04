-- ============================================================
-- FASE 4: Fluxo de aprovação + histórico de comissões
-- ============================================================

-- 1) Tabela de histórico de transições
CREATE TABLE IF NOT EXISTS public.commission_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id   uuid NOT NULL REFERENCES public.commissions(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  old_status      text,
  new_status      text NOT NULL,
  changed_by      uuid,
  changed_at      timestamptz NOT NULL DEFAULT now(),
  notes           text
);

CREATE INDEX IF NOT EXISTS idx_commission_history_commission_id
  ON public.commission_history (commission_id);
CREATE INDEX IF NOT EXISTS idx_commission_history_org_changed
  ON public.commission_history (organization_id, changed_at DESC);

ALTER TABLE public.commission_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commission_history_select" ON public.commission_history;
CREATE POLICY "commission_history_select"
ON public.commission_history FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM public.users WHERE id = auth.uid()
  )
);

DROP POLICY IF EXISTS "commission_history_insert" ON public.commission_history;
CREATE POLICY "commission_history_insert"
ON public.commission_history FOR INSERT
TO authenticated
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.users WHERE id = auth.uid()
  )
);

-- 2) Trigger que registra cada mudança de status
CREATE OR REPLACE FUNCTION public.log_commission_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.commission_history (commission_id, organization_id, old_status, new_status, changed_by, notes)
    VALUES (NEW.id, NEW.organization_id, NULL, NEW.status, auth.uid(), 'Criação da comissão');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.status,'') <> COALESCE(NEW.status,'') THEN
    INSERT INTO public.commission_history (commission_id, organization_id, old_status, new_status, changed_by, notes)
    VALUES (
      NEW.id,
      NEW.organization_id,
      OLD.status,
      NEW.status,
      COALESCE(NEW.approved_by, NEW.paid_by, auth.uid()),
      CASE
        WHEN NEW.status = 'pending'  THEN 'Liberada após pagamento do contrato'
        WHEN NEW.status = 'approved' THEN 'Comissão aprovada'
        WHEN NEW.status = 'paid'     THEN 'Pagamento registrado'
        WHEN NEW.status = 'cancelled' THEN COALESCE(NEW.notes, 'Comissão cancelada')
        ELSE NULL
      END
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_commission_status_change ON public.commissions;
CREATE TRIGGER trg_log_commission_status_change
AFTER INSERT OR UPDATE OF status ON public.commissions
FOR EACH ROW
EXECUTE FUNCTION public.log_commission_status_change();

-- 3) Backfill: gerar histórico para comissões já existentes
INSERT INTO public.commission_history (commission_id, organization_id, old_status, new_status, changed_by, changed_at, notes)
SELECT c.id, c.organization_id, NULL, c.status, NULL, c.created_at, 'Backfill — estado inicial'
FROM public.commissions c
WHERE NOT EXISTS (
  SELECT 1 FROM public.commission_history h WHERE h.commission_id = c.id
);
