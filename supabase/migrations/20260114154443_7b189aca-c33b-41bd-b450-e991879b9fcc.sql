-- Add sender info columns to whatsapp_messages for group messages
ALTER TABLE public.whatsapp_messages 
ADD COLUMN IF NOT EXISTS sender_jid TEXT,
ADD COLUMN IF NOT EXISTS sender_name TEXT;

-- Add archive/delete columns to whatsapp_conversations
ALTER TABLE public.whatsapp_conversations 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create index for filtering archived/deleted conversations
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_archived 
ON public.whatsapp_conversations(archived_at) 
WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_deleted 
ON public.whatsapp_conversations(deleted_at) 
WHERE deleted_at IS NOT NULL;

-- Create index for contact_phone to optimize duplicate detection
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_contact_phone 
ON public.whatsapp_conversations(session_id, contact_phone);

-- Create storage bucket for whatsapp media
INSERT INTO storage.buckets (id, name, public) 
VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy for public read access
CREATE POLICY "Public read access for whatsapp media"
ON storage.objects FOR SELECT
USING (bucket_id = 'whatsapp-media');

-- Create storage policy for authenticated uploads
CREATE POLICY "Authenticated users can upload whatsapp media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'whatsapp-media');

-- Create storage policy for service role to upload (for edge functions)
CREATE POLICY "Service role can manage whatsapp media"
ON storage.objects FOR ALL
USING (bucket_id = 'whatsapp-media')
WITH CHECK (bucket_id = 'whatsapp-media');