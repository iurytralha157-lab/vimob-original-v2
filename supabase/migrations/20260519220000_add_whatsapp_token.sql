ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS token text;

-- Update existing evolution_go sessions to have 'default_token' if they don't have one
UPDATE whatsapp_sessions SET token = 'default_token' WHERE provider = 'evolution_go' AND token IS NULL;
