-- 1. Adicionar colunas em whatsapp_messages
ALTER TABLE whatsapp_messages 
ADD COLUMN IF NOT EXISTS media_status TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS media_storage_path TEXT,
ADD COLUMN IF NOT EXISTS media_error TEXT;

-- 2. Criar índice para queries de mídia pendente
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_media_status 
ON whatsapp_messages(media_status) 
WHERE media_status IS NOT NULL;

-- 3. Criar tabela media_jobs
CREATE TABLE IF NOT EXISTS media_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES whatsapp_messages(id) ON DELETE CASCADE,
  remote_jid TEXT,
  message_key JSONB,
  media_type TEXT NOT NULL,
  media_mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Índices para o worker
CREATE INDEX IF NOT EXISTS idx_media_jobs_pending ON media_jobs(status, next_retry_at) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_media_jobs_message ON media_jobs(message_id);

-- 5. RLS para media_jobs
ALTER TABLE media_jobs ENABLE ROW LEVEL SECURITY;

-- Policy para service role (edge functions)
CREATE POLICY "Service role full access on media_jobs" ON media_jobs
FOR ALL USING (true) WITH CHECK (true);

-- 6. Trigger para updated_at
CREATE TRIGGER update_media_jobs_updated_at
BEFORE UPDATE ON media_jobs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 7. Atualizar mensagens existentes sem mídia válida
UPDATE whatsapp_messages 
SET media_status = 'failed', 
    media_error = 'Legacy message - media expired'
WHERE message_type IN ('image', 'video', 'audio', 'document', 'sticker')
AND (media_url IS NULL OR media_url = '' OR media_url LIKE '%mmg.whatsapp.net%')
AND media_status IS NULL;

-- Marcar mensagens com mídia válida como ready
UPDATE whatsapp_messages
SET media_status = 'ready'
WHERE message_type IN ('image', 'video', 'audio', 'document', 'sticker')
AND media_url IS NOT NULL 
AND media_url != ''
AND media_url NOT LIKE '%mmg.whatsapp.net%'
AND media_status IS NULL;