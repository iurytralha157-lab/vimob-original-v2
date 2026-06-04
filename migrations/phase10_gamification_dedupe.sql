-- Phase 10: dedupe gamification (schedule wins over activity)
-- Atividades do tipo visita/reunião também geram um registro em schedule_events,
-- então o trigger de activities estava duplicando os pontos. A partir de agora,
-- o trigger de activities ignora esses tipos — schedule_events é a fonte canônica.

CREATE OR REPLACE FUNCTION public.handle_activity_gamification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_action text; v_org uuid; v_meta jsonb;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  v_meta := COALESCE(NEW.metadata, '{}'::jsonb);
  IF COALESCE((v_meta->>'skip_gamification')::boolean, false) THEN RETURN NEW; END IF;

  SELECT organization_id INTO v_org FROM public.users WHERE id = NEW.user_id;
  IF v_org IS NULL THEN RETURN NEW; END IF;

  v_action := CASE NEW.type
    WHEN 'call'                  THEN 'call_made'
    WHEN 'call_made'             THEN 'call_made'
    WHEN 'message'               THEN 'message_sent'
    WHEN 'message_sent'          THEN 'message_sent'
    WHEN 'whatsapp_message_sent' THEN 'message_sent'
    WHEN 'lead_created_manual'   THEN 'lead_created_manual'
    WHEN 'property_created'      THEN 'property_created'
    WHEN 'sale_closed'           THEN 'sale_closed'
    WHEN 'proposal_sent'         THEN 'proposal_sent'
    -- Visitas e reuniões são processadas pelo trigger de schedule_events
    -- (handle_schedule_gamification). Ignoramos aqui para evitar duplicidade.
    ELSE NULL
  END;

  IF v_action IS NULL THEN RETURN NEW; END IF;
  PERFORM public.process_gamification_event(
    NEW.user_id, v_org, v_action, 1, NEW.id,
    v_meta || jsonb_build_object('source_module','activity'));
  RETURN NEW;
END; $$;

-- Limpeza retroativa: remove logs duplicados de visita/reunião originados de "activity"
-- nos últimos 7 dias, quando existe equivalente vindo de "schedule" para o mesmo usuário.
WITH dupes AS (
  SELECT a.id
  FROM public.gamification_activity_logs a
  WHERE a.created_at > now() - interval '7 days'
    AND a.action_type IN ('visit_scheduled','visit_confirmed','meeting_scheduled','meeting_held')
    AND (a.metadata->>'source_module') = 'activity'
    AND EXISTS (
      SELECT 1 FROM public.gamification_activity_logs b
      WHERE b.user_id = a.user_id
        AND b.action_type = a.action_type
        AND (b.metadata->>'source_module') = 'schedule'
        AND abs(extract(epoch FROM (b.created_at - a.created_at))) < 300
    )
),
deleted AS (
  DELETE FROM public.gamification_activity_logs
  WHERE id IN (SELECT id FROM dupes)
  RETURNING user_id, COALESCE(points_earned, xp_awarded, 0) AS pts
),
agg AS (
  SELECT user_id, SUM(pts)::int AS pts FROM deleted GROUP BY user_id
)
UPDATE public.user_gamification_stats s
SET xp = GREATEST(COALESCE(s.xp,0) - agg.pts, 0),
    total_points = GREATEST(COALESCE(s.total_points,0) - agg.pts, 0),
    updated_at = now()
FROM agg
WHERE s.user_id = agg.user_id;
