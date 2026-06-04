-- ============================================================
-- FASE 1 — Hardening da integração Meta (sem risco para produção)
-- Aplicar em: Supabase Dashboard > SQL Editor
-- Projeto: iemalzlfnbouobyjwlwi
-- ============================================================

-- 1) Tabela de eventos brutos do webhook Meta
--    Persistimos o payload ANTES de processar para nunca perder lead.
CREATE TABLE IF NOT EXISTS public.meta_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  object text,
  page_id text,
  leadgen_id text,
  form_id text,
  signature_valid boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'received',
  -- valores de status: received | processed | failed | skipped | duplicate
  error_message text,
  processed_at timestamptz,
  organization_id uuid,
  raw_payload jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS meta_webhook_events_page_recv_idx
  ON public.meta_webhook_events (page_id, received_at DESC);
CREATE INDEX IF NOT EXISTS meta_webhook_events_status_recv_idx
  ON public.meta_webhook_events (status, received_at DESC);
CREATE INDEX IF NOT EXISTS meta_webhook_events_org_recv_idx
  ON public.meta_webhook_events (organization_id, received_at DESC);
CREATE INDEX IF NOT EXISTS meta_webhook_events_leadgen_idx
  ON public.meta_webhook_events (leadgen_id) WHERE leadgen_id IS NOT NULL;

ALTER TABLE public.meta_webhook_events ENABLE ROW LEVEL SECURITY;

-- Admins da organização leem eventos da própria org
DROP POLICY IF EXISTS "meta_webhook_events_select_org_admin" ON public.meta_webhook_events;
CREATE POLICY "meta_webhook_events_select_org_admin"
  ON public.meta_webhook_events
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE id = auth.uid() AND role IN ('admin','super_admin')
    )
  );

-- Super admin lê tudo
DROP POLICY IF EXISTS "meta_webhook_events_select_super_admin" ON public.meta_webhook_events;
CREATE POLICY "meta_webhook_events_select_super_admin"
  ON public.meta_webhook_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Sem políticas de INSERT/UPDATE/DELETE: só service role (edge function) escreve.

-- 2) Dedupe de leads vindos do Meta (índice único parcial)
--    Já validamos: 0 duplicatas existentes em leads.meta_lead_id.
CREATE UNIQUE INDEX IF NOT EXISTS leads_meta_lead_id_uq
  ON public.leads (meta_lead_id) WHERE meta_lead_id IS NOT NULL;

-- ============================================================
-- ROLLBACK (se necessário):
--   DROP INDEX IF EXISTS public.leads_meta_lead_id_uq;
--   DROP TABLE IF EXISTS public.meta_webhook_events;
-- ============================================================
