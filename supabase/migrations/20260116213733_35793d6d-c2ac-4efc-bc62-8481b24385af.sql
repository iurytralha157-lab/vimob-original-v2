-- Add client_message_id column for optimistic updates
ALTER TABLE public.whatsapp_messages 
ADD COLUMN IF NOT EXISTS client_message_id TEXT;

-- Create index for faster lookups on client_message_id
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_client_message_id 
ON public.whatsapp_messages(client_message_id) 
WHERE client_message_id IS NOT NULL;