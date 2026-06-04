-- ============================================================================
-- ARENA IMOBILIÁRIA — Correção estrutural + Temporadas
-- - Recria triggers ausentes que ligam CRM → motor de XP
-- - Corrige process_gamification_event (ROW_COUNT inteiro + idempotência)
-- - Adiciona suporte a temporadas (reset de níveis preservando histórico)
-- - Cria RPC reset_gamification_season(p_org_id, p_season_name, p_reason)
-- Idempotente.
-- ============================================================================

-- 1) Temporadas: completar schema --------------------------------------------
ALTER TABLE public.gamification_seasons
  ADD COLUMN IF NOT EXISTS started_at  timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ended_at    timestamptz,
  ADD COLUMN IF NOT EXISTS created_by  uuid,
  ADD COLUMN IF NOT EXISTS reset_reason text;

ALTER TABLE public.gamification_activity_logs
  ADD COLUMN IF NOT EXISTS season_id uuid;

ALTER TABLE public.user_gamification_stats
  ADD COLUMN IF NOT EXISTS season_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_season_per_org
  ON public.gamification_seasons(organization_id)
  WHERE is_active = true;

ALTER TABLE public.gamification_seasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View seasons of own org" ON public.gamification_seasons;
CREATE POLICY "View seasons of own org" ON public.gamification_seasons
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins manage seasons" ON public.gamification_seasons;
CREATE POLICY "Admins manage seasons" ON public.gamification_seasons
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE id = auth.uid() AND role IN ('admin','super_admin')
    )
  ) WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE id = auth.uid() AND role IN ('admin','super_admin')
    )
  );

CREATE OR REPLACE FUNCTION public.get_or_create_active_season(p_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.gamification_seasons
   WHERE organization_id = p_org_id AND is_active = true LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.gamification_seasons (organization_id, name, start_date, end_date, is_active, started_at)
    VALUES (p_org_id, 'Temporada Inicial', CURRENT_DATE, CURRENT_DATE + INTERVAL '90 days', true, now())
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;

-- 2) Motor central corrigido -------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_gamification_event(
  p_user_id uuid,
  p_org_id uuid,
  p_event_type text,
  p_quantity int DEFAULT 1,
  p_reference_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_unit_points int;
  v_xp_awarded int;
  v_qty int := GREATEST(COALESCE(p_quantity,1), 1);
  v_action text := lower(p_event_type);
  v_org uuid := p_org_id;
  v_old_xp int;
  v_new_xp int;
  v_old_level int;
  v_new_level int;
  v_next_xp int;
  v_cur_lvl_xp int;
  v_tier text;
  v_mission record;
  v_prog record;
  v_period_start timestamptz;
  v_new_count int;
  v_was_completed boolean;
  v_idem text;
  v_inserted int;
  v_season uuid;
  v_meta jsonb;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  IF v_org IS NULL THEN
    SELECT organization_id INTO v_org FROM public.users WHERE id = p_user_id;
  END IF;
  IF v_org IS NULL THEN RETURN; END IF;

  v_season := public.get_or_create_active_season(v_org);

  SELECT points INTO v_unit_points
  FROM public.gamification_rules
  WHERE organization_id = v_org AND lower(action_type) = v_action AND is_active = true
  LIMIT 1;

  IF v_unit_points IS NULL THEN
    v_unit_points := CASE v_action
      WHEN 'call'                THEN 5
      WHEN 'call_made'           THEN 5
      WHEN 'message'             THEN 1
      WHEN 'message_sent'        THEN 1
      WHEN 'lead'                THEN 10
      WHEN 'lead_created'        THEN 10
      WHEN 'lead_created_manual' THEN 10
      WHEN 'visit_scheduled'     THEN 10
      WHEN 'visit_done'          THEN 20
      WHEN 'visit_confirmed'     THEN 20
      WHEN 'meeting_scheduled'   THEN 5
      WHEN 'meeting_done'        THEN 15
      WHEN 'meeting_held'        THEN 15
      WHEN 'proposal'            THEN 20
      WHEN 'proposal_sent'       THEN 20
      WHEN 'sale'                THEN 500
      WHEN 'sale_closed'         THEN 500
      WHEN 'contract_signed'     THEN 500
      WHEN 'property_captured'   THEN 15
      WHEN 'property_created'    THEN 15
      WHEN 'prospecting_report'  THEN 5
      WHEN 'mission_bonus'       THEN 0
      WHEN 'streak_bonus'        THEN 0
      WHEN 'level_up'            THEN 0
      ELSE 1
    END;
  END IF;

  v_xp_awarded := v_unit_points * v_qty + COALESCE((p_metadata->>'bonus')::int, 0);
  IF v_xp_awarded <= 0 AND v_action NOT IN ('mission_bonus','level_up','streak_bonus') THEN
    RETURN;
  END IF;

  v_idem := v_action || '_' || COALESCE(p_reference_id::text, gen_random_uuid()::text) || '_' || v_qty::text;

  v_meta := COALESCE(p_metadata,'{}'::jsonb)
            || jsonb_build_object(
                 'count', v_qty,
                 'unit_points', v_unit_points,
                 'season_id', v_season
               );

  INSERT INTO public.gamification_activity_logs (
    user_id, organization_id, action_type, points_earned, xp_awarded,
    quantity, reference_id, metadata, idempotency_key, season_id
  ) VALUES (
    p_user_id, v_org, v_action, v_xp_awarded, v_xp_awarded,
    v_qty, p_reference_id, v_meta, v_idem, v_season
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(xp,0), COALESCE(current_level,1)
    INTO v_old_xp, v_old_level
  FROM public.user_gamification_stats
  WHERE user_id = p_user_id;

  IF v_old_xp IS NULL THEN v_old_xp := 0; END IF;
  IF v_old_level IS NULL THEN v_old_level := 1; END IF;

  v_new_xp := v_old_xp + v_xp_awarded;
  v_new_level := public.gamification_level_for_xp(v_new_xp);
  v_cur_lvl_xp := public.gamification_xp_for_level(v_new_level);
  v_next_xp := public.gamification_xp_for_level(v_new_level + 1);
  v_tier := public.gamification_rank_tier(v_new_level);

  INSERT INTO public.user_gamification_stats (
    user_id, organization_id, total_points, xp, xp_total,
    current_level, xp_current_level, xp_next_level, rank_tier,
    current_rank, last_activity_at, updated_at, season_id
  ) VALUES (
    p_user_id, v_org, v_xp_awarded, v_new_xp, v_new_xp,
    v_new_level, v_cur_lvl_xp, v_next_xp, v_tier,
    v_tier, now(), now(), v_season
  )
  ON CONFLICT (user_id) DO UPDATE SET
    organization_id  = COALESCE(public.user_gamification_stats.organization_id, EXCLUDED.organization_id),
    total_points     = COALESCE(public.user_gamification_stats.total_points,0) + v_xp_awarded,
    xp               = v_new_xp,
    xp_total         = v_new_xp,
    current_level    = v_new_level,
    xp_current_level = v_cur_lvl_xp,
    xp_next_level    = v_next_xp,
    rank_tier        = v_tier,
    current_rank     = v_tier,
    last_activity_at = now(),
    updated_at       = now(),
    season_id        = v_season;

  IF v_new_level > v_old_level THEN
    INSERT INTO public.notifications (organization_id, user_id, type, title, content, is_read)
    VALUES (v_org, p_user_id, 'gamification',
            '🆙 Você subiu para ' || v_tier || ' (Nível ' || v_new_level || ')',
            'Continue assim! Próximo nível em ' || GREATEST(v_next_xp - v_new_xp, 0) || ' XP.',
            false);
  END IF;

  INSERT INTO public.gamification_streaks (user_id, organization_id, streak_type, current_streak, highest_streak, last_activity_at)
  VALUES (p_user_id, v_org, 'daily_activity', 1, 1, now())
  ON CONFLICT (user_id, streak_type) DO UPDATE SET
    current_streak = CASE
      WHEN public.gamification_streaks.last_activity_at::date = CURRENT_DATE THEN public.gamification_streaks.current_streak
      WHEN public.gamification_streaks.last_activity_at::date = CURRENT_DATE - 1 THEN public.gamification_streaks.current_streak + 1
      ELSE 1
    END,
    highest_streak = GREATEST(
      public.gamification_streaks.highest_streak,
      CASE
        WHEN public.gamification_streaks.last_activity_at::date = CURRENT_DATE THEN public.gamification_streaks.current_streak
        WHEN public.gamification_streaks.last_activity_at::date = CURRENT_DATE - 1 THEN public.gamification_streaks.current_streak + 1
        ELSE 1
      END
    ),
    last_activity_at = now();

  FOR v_mission IN
    SELECT * FROM public.gamification_missions
    WHERE organization_id = v_org
      AND is_active = true
      AND lower(action_type) = v_action
  LOOP
    v_period_start := CASE v_mission.period
      WHEN 'daily'   THEN date_trunc('day', now())
      WHEN 'weekly'  THEN date_trunc('week', now())
      WHEN 'monthly' THEN date_trunc('month', now())
      ELSE date_trunc('day', now())
    END;

    SELECT * INTO v_prog FROM public.user_mission_progress
    WHERE user_id = p_user_id AND mission_id = v_mission.id
    ORDER BY reset_at DESC NULLS LAST LIMIT 1;

    v_was_completed := COALESCE(v_prog.is_completed, false);

    IF v_prog.id IS NULL OR v_prog.reset_at IS NULL OR v_prog.reset_at < v_period_start THEN
      INSERT INTO public.user_mission_progress (user_id, mission_id, organization_id, current_count, is_completed, reset_at, updated_at, completed_at)
      VALUES (p_user_id, v_mission.id, v_org, v_qty, v_qty >= v_mission.target_count,
              v_period_start, now(),
              CASE WHEN v_qty >= v_mission.target_count THEN now() ELSE NULL END);
      v_new_count := v_qty;
      v_was_completed := false;
    ELSIF NOT v_prog.is_completed THEN
      v_new_count := v_prog.current_count + v_qty;
      UPDATE public.user_mission_progress SET
        current_count    = v_new_count,
        is_completed     = (v_new_count >= v_mission.target_count),
        completed_at     = CASE WHEN v_new_count >= v_mission.target_count AND completed_at IS NULL THEN now() ELSE completed_at END,
        organization_id  = COALESCE(organization_id, v_org),
        updated_at       = now()
      WHERE id = v_prog.id;
    ELSE
      CONTINUE;
    END IF;

    IF v_new_count >= v_mission.target_count AND NOT v_was_completed THEN
      INSERT INTO public.gamification_activity_logs (
        user_id, organization_id, action_type, points_earned, xp_awarded, quantity, reference_id, metadata, idempotency_key, season_id
      ) VALUES (
        p_user_id, v_org, 'mission_bonus', v_mission.bonus_points, v_mission.bonus_points,
        1, v_mission.id,
        jsonb_build_object('mission_title', v_mission.title, 'period', v_mission.period, 'season_id', v_season),
        'mission_bonus_' || v_mission.id || '_' || extract(epoch from v_period_start)::text,
        v_season
      ) ON CONFLICT (idempotency_key) DO NOTHING;

      UPDATE public.user_gamification_stats SET
        xp               = xp + v_mission.bonus_points,
        xp_total         = xp_total + v_mission.bonus_points,
        total_points     = total_points + v_mission.bonus_points,
        current_level    = public.gamification_level_for_xp(xp + v_mission.bonus_points),
        xp_current_level = public.gamification_xp_for_level(public.gamification_level_for_xp(xp + v_mission.bonus_points)),
        xp_next_level    = public.gamification_xp_for_level(public.gamification_level_for_xp(xp + v_mission.bonus_points) + 1),
        rank_tier        = public.gamification_rank_tier(public.gamification_level_for_xp(xp + v_mission.bonus_points)),
        current_rank     = public.gamification_rank_tier(public.gamification_level_for_xp(xp + v_mission.bonus_points)),
        updated_at       = now()
      WHERE user_id = p_user_id;

      INSERT INTO public.notifications (organization_id, user_id, type, title, content, is_read)
      VALUES (v_org, p_user_id, 'gamification',
              '🎯 Missão concluída: ' || v_mission.title,
              '+' || v_mission.bonus_points || ' XP de bônus!',
              false);
    END IF;
  END LOOP;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'process_gamification_event error: %', SQLERRM;
END;
$$;

-- 3) Wrappers de trigger -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_lead_gamification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.assigned_user_id IS NOT NULL THEN
    PERFORM public.process_gamification_event(
      NEW.assigned_user_id, NEW.organization_id, 'lead_created', 1, NEW.id,
      jsonb_build_object('lead_name', NEW.name, 'source_module', 'crm'));
  ELSIF TG_OP = 'UPDATE' AND NEW.deal_status = 'won' AND COALESCE(OLD.deal_status,'') <> 'won' THEN
    PERFORM public.process_gamification_event(
      NEW.assigned_user_id, NEW.organization_id, 'sale_closed', 1, NEW.id,
      jsonb_build_object('lead_name', NEW.name, 'sale_value', NEW.valor_interesse, 'source_module', 'crm'));
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.handle_call_gamification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    PERFORM public.process_gamification_event(
      NEW.user_id, NEW.organization_id, 'call_made', 1, NEW.id,
      jsonb_build_object('source_module','telephony'));
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.handle_prospecting_report_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.calls,0) > 0 THEN
    PERFORM public.process_gamification_event(NEW.user_id, NEW.organization_id, 'call_made', NEW.calls, NEW.id,
      jsonb_build_object('source', NEW.source, 'source_module','prospecting_report'));
  END IF;
  IF COALESCE(NEW.scheduled_visits,0) > 0 THEN
    PERFORM public.process_gamification_event(NEW.user_id, NEW.organization_id, 'visit_scheduled', NEW.scheduled_visits, NEW.id,
      jsonb_build_object('source', NEW.source, 'source_module','prospecting_report'));
  END IF;
  IF COALESCE(NEW.confirmed_visits,0) > 0 THEN
    PERFORM public.process_gamification_event(NEW.user_id, NEW.organization_id, 'visit_confirmed', NEW.confirmed_visits, NEW.id,
      jsonb_build_object('source_module','prospecting_report'));
  END IF;
  IF COALESCE(NEW.meetings,0) > 0 THEN
    PERFORM public.process_gamification_event(NEW.user_id, NEW.organization_id, 'meeting_held', NEW.meetings, NEW.id,
      jsonb_build_object('source_module','prospecting_report'));
  END IF;
  IF COALESCE(NEW.proposals_sent,0) > 0 THEN
    PERFORM public.process_gamification_event(NEW.user_id, NEW.organization_id, 'proposal_sent', NEW.proposals_sent, NEW.id,
      jsonb_build_object('source_module','prospecting_report'));
  END IF;
  RETURN NEW;
END; $$;

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
    WHEN 'visit_scheduled'       THEN 'visit_scheduled'
    WHEN 'meeting_scheduled'     THEN 'meeting_scheduled'
    WHEN 'visit_confirmed'       THEN 'visit_confirmed'
    WHEN 'visit_realized'        THEN 'visit_confirmed'
    WHEN 'meeting_held'          THEN 'meeting_held'
    WHEN 'proposal_sent'         THEN 'proposal_sent'
    ELSE NULL
  END;

  IF v_action IS NULL THEN RETURN NEW; END IF;
  PERFORM public.process_gamification_event(
    NEW.user_id, v_org, v_action, 1, NEW.id,
    v_meta || jsonb_build_object('source_module','activity'));
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.handle_schedule_gamification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_action text;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := CASE NEW.event_type
      WHEN 'visit'   THEN 'visit_scheduled'
      WHEN 'meeting' THEN 'meeting_scheduled'
      ELSE NULL
    END;
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND COALESCE(OLD.status,'') <> 'completed' THEN
    v_action := CASE NEW.event_type
      WHEN 'visit'   THEN 'visit_confirmed'
      WHEN 'meeting' THEN 'meeting_held'
      ELSE NULL
    END;
  END IF;

  IF v_action IS NULL THEN RETURN NEW; END IF;
  PERFORM public.process_gamification_event(NEW.user_id, NEW.organization_id, v_action, 1, NEW.id,
    jsonb_build_object('title', NEW.title, 'event_type', NEW.event_type, 'source_module','schedule'));
  RETURN NEW;
END; $$;

-- 4) Recriar TRIGGERS --------------------------------------------------------
DROP TRIGGER IF EXISTS tr_lead_gamification          ON public.leads;
DROP TRIGGER IF EXISTS tr_call_gamification          ON public.telephony_calls;
DROP TRIGGER IF EXISTS tr_prospecting_report_points  ON public.prospecting_reports;
DROP TRIGGER IF EXISTS tr_activity_gamification      ON public.activities;
DROP TRIGGER IF EXISTS tr_schedule_gamification      ON public.schedule_events;

CREATE TRIGGER tr_lead_gamification
  AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.handle_lead_gamification();

CREATE TRIGGER tr_call_gamification
  AFTER INSERT ON public.telephony_calls
  FOR EACH ROW EXECUTE FUNCTION public.handle_call_gamification();

CREATE TRIGGER tr_prospecting_report_points
  AFTER INSERT ON public.prospecting_reports
  FOR EACH ROW EXECUTE FUNCTION public.handle_prospecting_report_points();

CREATE TRIGGER tr_activity_gamification
  AFTER INSERT ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.handle_activity_gamification();

CREATE TRIGGER tr_schedule_gamification
  AFTER INSERT OR UPDATE ON public.schedule_events
  FOR EACH ROW EXECUTE FUNCTION public.handle_schedule_gamification();

-- 5) RPC reset_gamification_season -------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_gamification_season(
  p_organization_id uuid,
  p_season_name text,
  p_reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_caller_org uuid;
  v_new_season uuid;
  v_user record;
BEGIN
  SELECT role, organization_id INTO v_caller_role, v_caller_org
  FROM public.users WHERE id = auth.uid();

  IF v_caller_role NOT IN ('admin','super_admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem reiniciar temporadas';
  END IF;

  IF v_caller_role <> 'super_admin' AND v_caller_org <> p_organization_id THEN
    RAISE EXCEPTION 'Sem permissão para esta organização';
  END IF;

  UPDATE public.gamification_seasons
     SET is_active = false, ended_at = now()
   WHERE organization_id = p_organization_id AND is_active = true;

  INSERT INTO public.gamification_seasons (
    organization_id, name, start_date, end_date, is_active,
    started_at, created_by, reset_reason
  ) VALUES (
    p_organization_id, COALESCE(NULLIF(trim(p_season_name),''), 'Nova Temporada'),
    CURRENT_DATE, CURRENT_DATE + INTERVAL '90 days', true,
    now(), auth.uid(), p_reason
  ) RETURNING id INTO v_new_season;

  UPDATE public.user_gamification_stats SET
    total_points     = 0,
    xp               = 0,
    xp_total         = 0,
    current_level    = 1,
    xp_current_level = 0,
    xp_next_level    = 100,
    rank_tier        = 'Bronze I',
    current_rank     = 'Bronze I',
    streak_days      = 0,
    season_id        = v_new_season,
    updated_at       = now()
  WHERE organization_id = p_organization_id;

  UPDATE public.user_mission_progress p SET
    current_count = 0,
    is_completed  = false,
    completed_at  = NULL,
    reset_at      = now(),
    updated_at    = now()
  FROM public.gamification_missions m
  WHERE p.mission_id = m.id
    AND m.organization_id = p_organization_id;

  FOR v_user IN
    SELECT id FROM public.users
    WHERE organization_id = p_organization_id AND COALESCE(is_active, true) = true
  LOOP
    INSERT INTO public.notifications (organization_id, user_id, type, title, content, is_read)
    VALUES (
      p_organization_id, v_user.id, 'gamification',
      '🏁 Nova temporada iniciada: ' || COALESCE(NULLIF(trim(p_season_name),''), 'Nova Temporada'),
      'Os níveis foram reiniciados. Hora de começar do zero e dominar o ranking!',
      false
    );
  END LOOP;

  RETURN v_new_season;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_gamification_season(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_active_season(uuid) TO authenticated;
