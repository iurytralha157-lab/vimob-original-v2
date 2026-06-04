ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS token text;
UPDATE whatsapp_sessions SET token = 'default_token' WHERE provider = 'evolution_go' AND token IS NULL;
