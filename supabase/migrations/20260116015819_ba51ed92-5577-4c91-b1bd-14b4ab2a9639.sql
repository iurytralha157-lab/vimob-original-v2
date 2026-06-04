-- Fix storage policies - drop existing ones first with IF EXISTS pattern
DROP POLICY IF EXISTS "Org users can read whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Org users can upload whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Org users can update whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Org users can delete whatsapp media" ON storage.objects;

-- Recreate all policies for whatsapp-media bucket
CREATE POLICY "Org users can read whatsapp media"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'whatsapp-media' 
  AND (
    (storage.foldername(name))[1] = 'orgs' 
    AND ((storage.foldername(name))[2])::uuid = public.auth_org_id()
  )
);

CREATE POLICY "Org users can upload whatsapp media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'whatsapp-media' 
  AND (
    (storage.foldername(name))[1] = 'orgs' 
    AND ((storage.foldername(name))[2])::uuid = public.auth_org_id()
  )
);

CREATE POLICY "Org users can update whatsapp media"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'whatsapp-media' 
  AND (
    (storage.foldername(name))[1] = 'orgs' 
    AND ((storage.foldername(name))[2])::uuid = public.auth_org_id()
  )
);

CREATE POLICY "Org users can delete whatsapp media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'whatsapp-media' 
  AND (
    (storage.foldername(name))[1] = 'orgs' 
    AND ((storage.foldername(name))[2])::uuid = public.auth_org_id()
  )
);

-- Create outbox_messages table if not exists (in case previous migration partially succeeded)
CREATE TABLE IF NOT EXISTS public.outbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  media_url TEXT,
  media_base64 TEXT,
  media_mime_type TEXT,
  media_filename TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  error_message TEXT,
  sent_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id)
);

ALTER TABLE public.outbox_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own org outbox" ON public.outbox_messages;
DROP POLICY IF EXISTS "Users can insert to own org outbox" ON public.outbox_messages;
DROP POLICY IF EXISTS "Users can update own org outbox" ON public.outbox_messages;

CREATE POLICY "Users can view own org outbox"
ON public.outbox_messages FOR SELECT
USING (organization_id = public.auth_org_id());

CREATE POLICY "Users can insert to own org outbox"
ON public.outbox_messages FOR INSERT
WITH CHECK (organization_id = public.auth_org_id());

CREATE POLICY "Users can update own org outbox"
ON public.outbox_messages FOR UPDATE
USING (organization_id = public.auth_org_id());

CREATE INDEX IF NOT EXISTS idx_outbox_pending 
ON public.outbox_messages (status, created_at) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_outbox_session 
ON public.outbox_messages (session_id);

DROP TRIGGER IF EXISTS enforce_org_outbox_messages ON public.outbox_messages;
CREATE TRIGGER enforce_org_outbox_messages
BEFORE INSERT ON public.outbox_messages
FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_id();