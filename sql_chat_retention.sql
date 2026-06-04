-- ============================================================
-- Phase 4: Automatic retention for orphan group chats
-- Run this in the Supabase SQL editor
-- ============================================================
-- Strategy:
--   * NEVER delete conversations with lead_id IS NOT NULL
--   * NEVER delete direct (1:1) conversations, even without lead
--   * Delete messages of orphan GROUP conversations older than 15 days
--   * Delete orphan group conversations themselves after 30 days of inactivity
--   * Trim media_jobs (done > 30d) and meta_webhook_events (> 30d)
-- ============================================================

-- Supporting index to make retention DELETEs fast
CREATE INDEX IF NOT EXISTS idx_whatsapp_conv_orphan_groups
  ON public.whatsapp_conversations (is_group, lead_id, last_message_at)
  WHERE lead_id IS NULL AND is_group = true;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_sent_at
  ON public.whatsapp_messages (sent_at);

-- Retention function (SECURITY DEFINER, strict search_path)
CREATE OR REPLACE FUNCTION public.cleanup_whatsapp_retention()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_msgs   integer := 0;
  deleted_convs  integer := 0;
  deleted_jobs   integer := 0;
  deleted_meta   integer := 0;
BEGIN
  -- 1) Delete messages from orphan group conversations older than 15 days
  WITH del AS (
    DELETE FROM public.whatsapp_messages m
    USING public.whatsapp_conversations c
    WHERE c.id = m.conversation_id
      AND c.is_group = true
      AND c.lead_id IS NULL
      AND m.sent_at < now() - interval '15 days'
    RETURNING m.id
  )
  SELECT count(*) INTO deleted_msgs FROM del;

  -- 2) Delete orphan group conversations idle for > 30 days
  WITH del AS (
    DELETE FROM public.whatsapp_conversations
    WHERE is_group = true
      AND lead_id IS NULL
      AND (last_message_at IS NULL OR last_message_at < now() - interval '30 days')
    RETURNING id
  )
  SELECT count(*) INTO deleted_convs FROM del;

  -- 3) Trim completed media jobs older than 30 days
  BEGIN
    WITH del AS (
      DELETE FROM public.media_jobs
      WHERE status = 'done'
        AND updated_at < now() - interval '30 days'
      RETURNING id
    )
    SELECT count(*) INTO deleted_jobs FROM del;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    deleted_jobs := 0;
  END;

  -- 4) Trim meta webhook events older than 30 days
  BEGIN
    WITH del AS (
      DELETE FROM public.meta_webhook_events
      WHERE created_at < now() - interval '30 days'
      RETURNING id
    )
    SELECT count(*) INTO deleted_meta FROM del;
  EXCEPTION WHEN undefined_table THEN
    deleted_meta := 0;
  END;

  RAISE NOTICE 'whatsapp retention: messages=% conversations=% media_jobs=% meta_events=%',
    deleted_msgs, deleted_convs, deleted_jobs, deleted_meta;
END;
$$;

-- Schedule daily at 03:00 UTC (00:00 BRT).
DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-retention-daily')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-retention-daily'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'whatsapp-retention-daily',
  '0 3 * * *',
  $$ SELECT public.cleanup_whatsapp_retention(); $$
);

-- ============================================================
-- One-time backfill (run manually to immediately free ~120 MB):
--   SELECT public.cleanup_whatsapp_retention();
-- ============================================================
