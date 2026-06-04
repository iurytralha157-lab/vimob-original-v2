-- Etapa 2: Add creative_video_url to lead_meta
ALTER TABLE public.lead_meta ADD COLUMN IF NOT EXISTS creative_video_url text;

-- Etapa 3: Allow users who can access the lead to view its WhatsApp conversations
CREATE POLICY "Users can view conversations linked to accessible leads"
ON public.whatsapp_conversations
FOR SELECT
TO authenticated
USING (
  lead_id IS NOT NULL 
  AND public.can_access_lead(lead_id)
);

-- Allow users who can access the lead to view its WhatsApp messages
CREATE POLICY "Users can view messages from lead-linked conversations"
ON public.whatsapp_messages
FOR SELECT
TO authenticated
USING (
  conversation_id IN (
    SELECT wc.id 
    FROM whatsapp_conversations wc 
    WHERE wc.lead_id IS NOT NULL 
      AND public.can_access_lead(wc.lead_id)
  )
);