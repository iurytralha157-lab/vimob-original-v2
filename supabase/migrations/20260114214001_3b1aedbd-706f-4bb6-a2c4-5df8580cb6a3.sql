-- Adicionar display_name para nome amigável das sessões
ALTER TABLE whatsapp_sessions 
ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Adicionar campos de presence nas conversas
ALTER TABLE whatsapp_conversations
ADD COLUMN IF NOT EXISTS contact_presence TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS presence_updated_at TIMESTAMPTZ DEFAULT NULL;

-- Atualizar display_name existentes com instance_name atual
UPDATE whatsapp_sessions 
SET display_name = instance_name 
WHERE display_name IS NULL;