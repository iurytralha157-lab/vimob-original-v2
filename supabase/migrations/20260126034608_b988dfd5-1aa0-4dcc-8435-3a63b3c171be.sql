-- Ajustar FK whatsapp_conversations -> leads para SET NULL ao deletar
ALTER TABLE public.whatsapp_conversations
DROP CONSTRAINT IF EXISTS whatsapp_conversations_lead_id_fkey;

ALTER TABLE public.whatsapp_conversations
ADD CONSTRAINT whatsapp_conversations_lead_id_fkey
FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;

-- Ajustar FK leads -> pipelines para SET NULL ao deletar
ALTER TABLE public.leads
DROP CONSTRAINT IF EXISTS leads_pipeline_id_fkey;

ALTER TABLE public.leads
ADD CONSTRAINT leads_pipeline_id_fkey
FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE SET NULL;