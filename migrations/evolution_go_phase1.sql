-- =====================================================
-- FASE 1 — Suporte ao provider Evolution Go
-- =====================================================
-- Idempotente: pode rodar várias vezes sem erro.

-- 1) Provider em whatsapp_sessions
ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'evolution';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_sessions_provider_check'
  ) THEN
    ALTER TABLE public.whatsapp_sessions
      ADD CONSTRAINT whatsapp_sessions_provider_check
      CHECK (provider IN ('evolution','evolution_go'));
  END IF;
END$$;

ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS advanced_settings jsonb DEFAULT '{}'::jsonb;

-- 2) Labels (tags do WhatsApp)
CREATE TABLE IF NOT EXISTS public.whatsapp_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  remote_label_id text NOT NULL,
  name text NOT NULL,
  color int,
  predefined boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE (session_id, remote_label_id)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_chat_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES public.whatsapp_labels(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (conversation_id, label_id)
);

-- 3) Grupos do WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  group_jid text NOT NULL,
  subject text,
  description text,
  picture_url text,
  invite_link text,
  participants jsonb DEFAULT '[]'::jsonb,
  is_announce boolean DEFAULT false,
  owner_jid text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (session_id, group_jid)
);

-- 4) RLS
ALTER TABLE public.whatsapp_labels      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_chat_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_groups      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "labels_org_read"        ON public.whatsapp_labels;
DROP POLICY IF EXISTS "labels_org_manage"      ON public.whatsapp_labels;
DROP POLICY IF EXISTS "chat_labels_org_read"   ON public.whatsapp_chat_labels;
DROP POLICY IF EXISTS "chat_labels_org_manage" ON public.whatsapp_chat_labels;
DROP POLICY IF EXISTS "groups_org_read"        ON public.whatsapp_groups;
DROP POLICY IF EXISTS "groups_org_manage"      ON public.whatsapp_groups;

CREATE POLICY "labels_org_read" ON public.whatsapp_labels
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id());
CREATE POLICY "labels_org_manage" ON public.whatsapp_labels
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization_id())
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "chat_labels_org_read" ON public.whatsapp_chat_labels
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.whatsapp_conversations c
    WHERE c.id = whatsapp_chat_labels.conversation_id
      AND c.organization_id = public.get_user_organization_id()
  ));
CREATE POLICY "chat_labels_org_manage" ON public.whatsapp_chat_labels
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.whatsapp_conversations c
    WHERE c.id = whatsapp_chat_labels.conversation_id
      AND c.organization_id = public.get_user_organization_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.whatsapp_conversations c
    WHERE c.id = whatsapp_chat_labels.conversation_id
      AND c.organization_id = public.get_user_organization_id()
  ));

CREATE POLICY "groups_org_read" ON public.whatsapp_groups
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id());
CREATE POLICY "groups_org_manage" ON public.whatsapp_groups
  FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization_id())
  WITH CHECK (organization_id = public.get_user_organization_id());

-- 5) Índices
CREATE INDEX IF NOT EXISTS idx_labels_session     ON public.whatsapp_labels(session_id);
CREATE INDEX IF NOT EXISTS idx_groups_session     ON public.whatsapp_groups(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_labels_conv   ON public.whatsapp_chat_labels(conversation_id);
CREATE INDEX IF NOT EXISTS idx_sessions_provider  ON public.whatsapp_sessions(provider);
