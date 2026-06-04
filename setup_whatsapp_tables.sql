-- ============================================
-- SETUP WHATSAPP TABLES & POLICIES
-- ============================================

-- 1. Ensure whatsapp_sessions has all columns
ALTER TABLE public.whatsapp_sessions 
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'evolution',
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS instance_id text,
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS profile_name text,
  ADD COLUMN IF NOT EXISTS profile_picture text,
  ADD COLUMN IF NOT EXISTS is_notification_session boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS advanced_settings jsonb DEFAULT '{}'::jsonb;

-- 2. Ensure whatsapp_session_access exists
CREATE TABLE IF NOT EXISTS public.whatsapp_session_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  can_view boolean DEFAULT true,
  can_send boolean DEFAULT true,
  access_mode text DEFAULT 'assigned_leads_only',
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, user_id)
);

-- 3. Ensure whatsapp_conversations exists
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  remote_jid text NOT NULL,
  contact_name text,
  contact_phone text,
  contact_picture text,
  is_group boolean DEFAULT false,
  last_message text,
  last_message_at timestamptz,
  unread_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, remote_jid)
);

-- 4. Ensure whatsapp_messages exists
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  message_id text NOT NULL,
  content text,
  message_type text DEFAULT 'text',
  from_me boolean NOT NULL DEFAULT false,
  status text DEFAULT 'sent',
  media_url text,
  media_mime_type text,
  media_status text,
  media_storage_path text,
  media_size integer,
  sender_jid text,
  sender_name text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  read_at timestamptz,
  UNIQUE(conversation_id, message_id)
);

-- 5. Enable RLS on all tables
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_session_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- 6. Helper functions (if missing)
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  )
$$;

-- 7. Basic Policies (adjust as needed for your specific roles)
DO $$ 
BEGIN
    -- Sessions
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sessions_select') THEN
        CREATE POLICY sessions_select ON public.whatsapp_sessions FOR SELECT
        USING (organization_id = get_user_organization_id());
    END IF;

    -- Conversations
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'conversations_select') THEN
        CREATE POLICY conversations_select ON public.whatsapp_conversations FOR SELECT
        USING (organization_id = get_user_organization_id());
    END IF;

    -- Messages
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'messages_select') THEN
        CREATE POLICY messages_select ON public.whatsapp_messages FOR SELECT
        USING (session_id IN (SELECT id FROM public.whatsapp_sessions WHERE organization_id = get_user_organization_id()));
    END IF;
END $$;
