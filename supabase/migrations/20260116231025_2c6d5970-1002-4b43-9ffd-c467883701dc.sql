-- =====================================================
-- PARTE 2: Colunas SLA na tabela leads
-- =====================================================

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sla_status text DEFAULT 'ok';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sla_seconds_elapsed int DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sla_last_checked_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sla_notified_warning_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sla_notified_overdue_at timestamptz;

-- =====================================================
-- PARTE 3: Colunas First Touch (ação humana)
-- =====================================================

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_touch_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_touch_seconds int;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_touch_actor_user_id uuid REFERENCES public.users(id);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_touch_channel text;

-- Índices para SLA
CREATE INDEX IF NOT EXISTS idx_leads_sla_status ON public.leads(sla_status);
CREATE INDEX IF NOT EXISTS idx_leads_sla_pending ON public.leads(first_response_at, sla_status) WHERE first_response_at IS NULL;