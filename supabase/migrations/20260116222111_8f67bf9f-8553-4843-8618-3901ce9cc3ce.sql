-- Limpar URLs temporárias mmg.whatsapp.net e marcar para reprocessamento
-- Essas URLs são criptografadas/expiradas e não funcionam no frontend

-- Primeiro, atualizar mensagens com URLs temporárias para status pending
UPDATE public.whatsapp_messages
SET 
  media_url = NULL,
  media_status = 'pending',
  media_error = 'URL temporária expirada - aguardando reprocessamento'
WHERE 
  media_url IS NOT NULL 
  AND (
    media_url LIKE '%mmg.whatsapp.net%' 
    OR media_url LIKE '%pps.whatsapp.net%'
    OR media_url LIKE '%.enc%'
  )
  AND media_status != 'ready';

-- Criar jobs para reprocessar mensagens que têm mídia pendente mas não têm job
INSERT INTO public.media_jobs (
  organization_id,
  session_id,
  conversation_id,
  message_id,
  message_key,
  media_type,
  media_mime_type,
  status,
  next_retry_at,
  attempts
)
SELECT 
  ws.organization_id,
  wm.session_id,
  wm.conversation_id,
  wm.id,
  jsonb_build_object('id', wm.message_id),
  wm.message_type,
  SPLIT_PART(wm.media_mime_type, ';', 1), -- Normalizar MIME type
  'pending',
  NOW(),
  0
FROM public.whatsapp_messages wm
JOIN public.whatsapp_sessions ws ON ws.id = wm.session_id
WHERE 
  wm.message_type IN ('image', 'video', 'audio', 'document')
  AND wm.media_status = 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM public.media_jobs mj 
    WHERE mj.message_id = wm.id 
    AND mj.status = 'pending'
  );