-- Adicionar colunas faltantes em whatsapp_conversations
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS contact_presence text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS presence_updated_at timestamptz DEFAULT NULL;

-- Adicionar colunas faltantes em whatsapp_messages
ALTER TABLE whatsapp_messages
ADD COLUMN IF NOT EXISTS media_status text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS media_storage_path text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS media_error text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS media_size bigint DEFAULT NULL,
ADD COLUMN IF NOT EXISTS sender_jid text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS sender_name text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS client_message_id text DEFAULT NULL;

-- Criar índice único para deduplicação de mensagens
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_session_message_id_idx 
ON whatsapp_messages(session_id, message_id);

-- Índice para buscar por client_message_id
CREATE INDEX IF NOT EXISTS whatsapp_messages_client_message_id_idx 
ON whatsapp_messages(client_message_id) WHERE client_message_id IS NOT NULL;