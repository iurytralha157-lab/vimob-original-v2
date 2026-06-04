-- Evolution Go — Phase 10 (avatar + verified)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS whatsapp_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_avatar_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_verified BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_avatar_synced_at
  ON public.leads (whatsapp_avatar_synced_at NULLS FIRST);
