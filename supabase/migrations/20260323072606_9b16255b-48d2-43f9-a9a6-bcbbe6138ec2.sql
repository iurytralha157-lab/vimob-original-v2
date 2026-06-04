UPDATE whatsapp_messages 
SET media_status = 'failed', 
    media_error = 'Mídia expirada - mais de 7 dias sem download'
WHERE media_status = 'pending' 
  AND media_url IS NULL 
  AND sent_at < NOW() - INTERVAL '7 days'
  AND message_type IN ('image', 'audio', 'video', 'document')