-- Track when a WhatsApp message reached Vimob separately from the original
-- WhatsApp sent_at timestamp. Delayed provider/backfill batches can carry old
-- sent_at values, so conversations need a received timestamp for ordering.

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS received_at timestamp with time zone;

ALTER TABLE public.whatsapp_messages
  ALTER COLUMN received_at SET DEFAULT now();

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS last_message_received_at timestamp with time zone;

UPDATE public.whatsapp_conversations
SET last_message_received_at = last_message_at
WHERE last_message_received_at IS NULL
  AND last_message_at IS NOT NULL;

-- Surface conversations that were updated recently by delayed webhook batches.
UPDATE public.whatsapp_conversations
SET last_message_received_at = updated_at
WHERE updated_at >= now() - interval '24 hours'
  AND last_message_at IS NOT NULL
  AND updated_at - last_message_at > interval '1 hour'
  AND (
    last_message_received_at IS NULL
    OR last_message_received_at < updated_at
  );

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation_received_at
  ON public.whatsapp_messages (conversation_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_org_last_received
  ON public.whatsapp_conversations (
    organization_id,
    last_message_received_at DESC NULLS LAST,
    last_message_at DESC NULLS LAST,
    created_at DESC
  );

CREATE OR REPLACE FUNCTION public.set_whatsapp_message_received_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.received_at := COALESCE(NEW.received_at, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_whatsapp_message_received_at ON public.whatsapp_messages;
CREATE TRIGGER trg_set_whatsapp_message_received_at
BEFORE INSERT ON public.whatsapp_messages
FOR EACH ROW
EXECUTE FUNCTION public.set_whatsapp_message_received_at();

CREATE OR REPLACE FUNCTION public.touch_whatsapp_conversation_received_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.whatsapp_conversations
  SET last_message_received_at = GREATEST(
        COALESCE(last_message_received_at, '-infinity'::timestamp with time zone),
        NEW.received_at
      )
  WHERE id = NEW.conversation_id
    AND (
      last_message_received_at IS NULL
      OR last_message_received_at < NEW.received_at
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_whatsapp_conversation_received_at ON public.whatsapp_messages;
CREATE TRIGGER trg_touch_whatsapp_conversation_received_at
AFTER INSERT ON public.whatsapp_messages
FOR EACH ROW
EXECUTE FUNCTION public.touch_whatsapp_conversation_received_at();
