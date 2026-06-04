-- Merge Evolution Go @lid conversations into the stable phone conversation
-- when both represent the same contact in the same session.

CREATE TEMP TABLE _lid_conversation_merge ON COMMIT DROP AS
WITH lid_rows AS (
  SELECT *
  FROM public.whatsapp_conversations
  WHERE remote_jid LIKE '%@lid'
    AND is_group = false
    AND deleted_at IS NULL
    AND contact_name IS NOT NULL
), stable_rows AS (
  SELECT *
  FROM public.whatsapp_conversations
  WHERE remote_jid NOT LIKE '%@lid'
    AND is_group = false
    AND deleted_at IS NULL
    AND contact_name IS NOT NULL
)
SELECT DISTINCT ON (l.id)
  l.id AS lid_id,
  s.id AS stable_id
FROM lid_rows l
JOIN stable_rows s
  ON s.session_id = l.session_id
 AND s.organization_id = l.organization_id
 AND lower(btrim(s.contact_name)) = lower(btrim(l.contact_name))
 AND s.id <> l.id
ORDER BY l.id, s.last_message_at DESC NULLS LAST, s.created_at DESC;

UPDATE public.whatsapp_messages m
SET conversation_id = map.stable_id
FROM _lid_conversation_merge map
WHERE m.conversation_id = map.lid_id;

UPDATE public.whatsapp_chat_labels l
SET conversation_id = map.stable_id
FROM _lid_conversation_merge map
WHERE l.conversation_id = map.lid_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.whatsapp_chat_labels keep
    WHERE keep.conversation_id = map.stable_id
      AND keep.label_id = l.label_id
  );

DELETE FROM public.whatsapp_chat_labels l
USING _lid_conversation_merge map
WHERE l.conversation_id = map.lid_id;

UPDATE public.whatsapp_inbound_logs logs
SET conversation_id = map.stable_id
FROM _lid_conversation_merge map
WHERE logs.conversation_id = map.lid_id;

DELETE FROM public.whatsapp_conversations c
USING _lid_conversation_merge map
WHERE c.id = map.lid_id;
