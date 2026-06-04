-- Harden gamification scoring, prospecting reports, manual approvals and participation.

CREATE TABLE IF NOT EXISTS public.gamification_manual_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  action_key text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid REFERENCES public.users(id),
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gamification_manual_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own manual gamification entries" ON public.gamification_manual_entries;
CREATE POLICY "Users can manage own manual gamification entries"
ON public.gamification_manual_entries
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage org manual gamification entries" ON public.gamification_manual_entries;
CREATE POLICY "Admins can manage org manual gamification entries"
ON public.gamification_manual_entries
FOR ALL
USING (
  organization_id IN (
    SELECT u.organization_id
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  organization_id IN (
    SELECT u.organization_id
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('admin', 'super_admin')
  )
);

CREATE OR REPLACE FUNCTION public.get_gamification_points(p_org_id uuid, p_action_type text)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_points integer;
BEGIN
  SELECT points INTO v_points
  FROM public.gamification_rules
  WHERE organization_id = p_org_id
    AND lower(action_type) = lower(p_action_type)
    AND is_active = true
  LIMIT 1;

  RETURN COALESCE(v_points, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_gamification_event(
  p_user_id uuid,
  p_org_id uuid,
  p_event_type text,
  p_quantity integer DEFAULT 1,
  p_reference_id uuid DEFAULT NULL::uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_unit_points int;
  v_xp_awarded int;
  v_qty int := GREATEST(COALESCE(p_quantity, 1), 1);
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

  IF EXISTS (
    SELECT 1
    FROM public.gamification_participants gp
    WHERE gp.organization_id = v_org
      AND gp.user_id = p_user_id
      AND COALESCE(gp.participates, true) = false
  ) THEN
    RETURN;
  END IF;

  v_season := public.get_or_create_active_season(v_org);

  SELECT points INTO v_unit_points
  FROM public.gamification_rules
  WHERE organization_id = v_org
    AND lower(action_type) = v_action
    AND is_active = true
  LIMIT 1;

  IF v_unit_points IS NULL THEN
    v_unit_points := CASE v_action
      WHEN 'call'                THEN 5
      WHEN 'call_made'           THEN 5
      WHEN 'message'             THEN 2
      WHEN 'message_sent'        THEN 2
      WHEN 'lead'                THEN 10
      WHEN 'lead_created'        THEN 10
      WHEN 'lead_created_manual' THEN 10
      WHEN 'visit_scheduled'     THEN 20
      WHEN 'visit_done'          THEN 35
      WHEN 'visit_confirmed'     THEN 35
      WHEN 'meeting_scheduled'   THEN 10
      WHEN 'meeting_done'        THEN 25
      WHEN 'meeting_held'        THEN 25
      WHEN 'proposal'            THEN 30
      WHEN 'proposal_sent'       THEN 30
      WHEN 'sale'                THEN 500
      WHEN 'sale_closed'         THEN 500
      WHEN 'contract_signed'     THEN 250
      WHEN 'property_captured'   THEN 50
      WHEN 'property_created'    THEN 50
      WHEN 'prospecting_report'  THEN 0
      WHEN 'mission_bonus'       THEN 0
      WHEN 'streak_bonus'        THEN 0
      WHEN 'level_up'            THEN 0
      ELSE 1
    END;
  END IF;

  v_xp_awarded := (v_unit_points * v_qty) + COALESCE((p_metadata->>'bonus')::int, 0);
  IF v_xp_awarded <= 0 AND v_action NOT IN ('mission_bonus', 'level_up', 'streak_bonus') THEN
    RETURN;
  END IF;

  v_idem := v_action || '_' || COALESCE(p_reference_id::text, gen_random_uuid()::text) || '_' || v_qty::text || '_' || p_user_id::text;
  v_meta := COALESCE(p_metadata, '{}'::jsonb)
            || jsonb_build_object(
              'count', v_qty,
              'unit_points', v_unit_points,
              'season_id', v_season
            );

  INSERT INTO public.gamification_activity_logs (
    user_id,
    organization_id,
    action_type,
    points_earned,
    xp_awarded,
    quantity,
    reference_id,
    metadata,
    idempotency_key,
    season_id
  ) VALUES (
    p_user_id,
    v_org,
    v_action,
    v_xp_awarded,
    v_xp_awarded,
    v_qty,
    p_reference_id,
    v_meta,
    v_idem,
    v_season
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN RETURN; END IF;

  SELECT COALESCE(xp, 0), COALESCE(current_level, 1)
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
    user_id,
    organization_id,
    total_points,
    xp,
    xp_total,
    current_level,
    xp_current_level,
    xp_next_level,
    rank_tier,
    current_rank,
    last_activity_at,
    updated_at,
    season_id
  ) VALUES (
    p_user_id,
    v_org,
    v_xp_awarded,
    v_new_xp,
    v_new_xp,
    v_new_level,
    v_cur_lvl_xp,
    v_next_xp,
    v_tier,
    v_tier,
    now(),
    now(),
    v_season
  )
  ON CONFLICT (user_id) DO UPDATE SET
    organization_id  = COALESCE(public.user_gamification_stats.organization_id, EXCLUDED.organization_id),
    total_points     = COALESCE(public.user_gamification_stats.total_points, 0) + v_xp_awarded,
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
    VALUES (
      v_org,
      p_user_id,
      'gamification',
      'Você subiu para ' || v_tier || ' (Nível ' || v_new_level || ')',
      'Continue assim! Próximo nível em ' || GREATEST(v_next_xp - v_new_xp, 0) || ' XP.',
      false
    );
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
    SELECT *
    FROM public.gamification_missions
    WHERE organization_id = v_org
      AND is_active = true
      AND lower(action_type) = v_action
      AND (
        COALESCE(target_scope, 'organization') = 'organization'
        OR (target_scope = 'user' AND target_user_id = p_user_id)
      )
  LOOP
    v_period_start := CASE v_mission.period
      WHEN 'daily' THEN date_trunc('day', now())
      WHEN 'weekly' THEN date_trunc('week', now())
      WHEN 'monthly' THEN date_trunc('month', now())
      ELSE date_trunc('day', now())
    END;

    SELECT * INTO v_prog
    FROM public.user_mission_progress
    WHERE user_id = p_user_id
      AND mission_id = v_mission.id
      AND reset_at = v_period_start
    LIMIT 1;

    v_was_completed := COALESCE(v_prog.is_completed, false);

    IF v_prog.id IS NULL THEN
      INSERT INTO public.user_mission_progress (user_id, mission_id, organization_id, current_count, is_completed, reset_at, updated_at, completed_at)
      VALUES (
        p_user_id,
        v_mission.id,
        v_org,
        v_qty,
        v_qty >= v_mission.target_count,
        v_period_start,
        now(),
        CASE WHEN v_qty >= v_mission.target_count THEN now() ELSE NULL END
      );
      v_new_count := v_qty;
      v_was_completed := false;
    ELSIF NOT v_prog.is_completed THEN
      v_new_count := v_prog.current_count + v_qty;
      UPDATE public.user_mission_progress
      SET current_count = v_new_count,
          is_completed = (v_new_count >= v_mission.target_count),
          completed_at = CASE WHEN v_new_count >= v_mission.target_count AND completed_at IS NULL THEN now() ELSE completed_at END,
          organization_id = COALESCE(organization_id, v_org),
          updated_at = now()
      WHERE id = v_prog.id;
    ELSE
      CONTINUE;
    END IF;

    IF v_new_count >= v_mission.target_count AND NOT v_was_completed THEN
      INSERT INTO public.gamification_activity_logs (
        user_id,
        organization_id,
        action_type,
        points_earned,
        xp_awarded,
        quantity,
        reference_id,
        metadata,
        idempotency_key,
        season_id
      ) VALUES (
        p_user_id,
        v_org,
        'mission_bonus',
        v_mission.bonus_points,
        v_mission.bonus_points,
        1,
        v_mission.id,
        jsonb_build_object('mission_title', v_mission.title, 'period', v_mission.period, 'season_id', v_season),
        'mission_bonus_' || p_user_id::text || '_' || v_mission.id || '_' || extract(epoch from v_period_start)::text,
        v_season
      )
      ON CONFLICT (idempotency_key) DO NOTHING;

      UPDATE public.user_gamification_stats
      SET xp = xp + v_mission.bonus_points,
          xp_total = xp_total + v_mission.bonus_points,
          total_points = total_points + v_mission.bonus_points,
          current_level = public.gamification_level_for_xp(xp + v_mission.bonus_points),
          xp_current_level = public.gamification_xp_for_level(public.gamification_level_for_xp(xp + v_mission.bonus_points)),
          xp_next_level = public.gamification_xp_for_level(public.gamification_level_for_xp(xp + v_mission.bonus_points) + 1),
          rank_tier = public.gamification_rank_tier(public.gamification_level_for_xp(xp + v_mission.bonus_points)),
          current_rank = public.gamification_rank_tier(public.gamification_level_for_xp(xp + v_mission.bonus_points)),
          updated_at = now()
      WHERE user_id = p_user_id;

      INSERT INTO public.notifications (organization_id, user_id, type, title, content, is_read)
      VALUES (
        v_org,
        p_user_id,
        'gamification',
        'Missão concluída: ' || v_mission.title,
        '+' || v_mission.bonus_points || ' XP de bônus!',
        false
      );
    END IF;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'process_gamification_event error: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_gamification_points(
  p_user_id uuid,
  p_organization_id uuid,
  p_action_type text,
  p_reference_id uuid DEFAULT NULL::uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.process_gamification_event(
    p_user_id,
    p_organization_id,
    p_action_type,
    COALESCE((p_metadata->>'quantity')::int, 1),
    p_reference_id,
    p_metadata
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_prospecting_report_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(NEW.calls, 0) > 0 THEN
    PERFORM public.process_gamification_event(NEW.user_id, NEW.organization_id, 'call_made', NEW.calls, NEW.id,
      jsonb_build_object('source', NEW.source, 'source_module', 'prospecting_report'));
  END IF;
  IF COALESCE(NEW.messages, 0) > 0 THEN
    PERFORM public.process_gamification_event(NEW.user_id, NEW.organization_id, 'message_sent', NEW.messages, NEW.id,
      jsonb_build_object('source', NEW.source, 'source_module', 'prospecting_report'));
  END IF;
  IF COALESCE(NEW.scheduled_visits, 0) > 0 THEN
    PERFORM public.process_gamification_event(NEW.user_id, NEW.organization_id, 'visit_scheduled', NEW.scheduled_visits, NEW.id,
      jsonb_build_object('source', NEW.source, 'source_module', 'prospecting_report'));
  END IF;
  IF COALESCE(NEW.confirmed_visits, 0) > 0 THEN
    PERFORM public.process_gamification_event(NEW.user_id, NEW.organization_id, 'visit_confirmed', NEW.confirmed_visits, NEW.id,
      jsonb_build_object('source', NEW.source, 'source_module', 'prospecting_report'));
  END IF;
  IF COALESCE(NEW.meetings, 0) > 0 THEN
    PERFORM public.process_gamification_event(NEW.user_id, NEW.organization_id, 'meeting_held', NEW.meetings, NEW.id,
      jsonb_build_object('source', NEW.source, 'source_module', 'prospecting_report'));
  END IF;
  IF COALESCE(NEW.proposals_sent, 0) > 0 THEN
    PERFORM public.process_gamification_event(NEW.user_id, NEW.organization_id, 'proposal_sent', NEW.proposals_sent, NEW.id,
      jsonb_build_object('source', NEW.source, 'source_module', 'prospecting_report'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_prospecting_report_gamification ON public.prospecting_reports;
DROP TRIGGER IF EXISTS tr_prospecting_gamification ON public.prospecting_reports;
DROP TRIGGER IF EXISTS tr_gamification_prospecting ON public.prospecting_reports;
DROP TRIGGER IF EXISTS tr_prospecting_report_points ON public.prospecting_reports;
CREATE TRIGGER tr_prospecting_report_points
AFTER INSERT ON public.prospecting_reports
FOR EACH ROW EXECUTE FUNCTION public.handle_prospecting_report_points();

CREATE OR REPLACE FUNCTION public.handle_manual_gamification_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();

  IF TG_OP = 'UPDATE'
     AND NEW.status = 'approved'
     AND COALESCE(OLD.status, '') <> 'approved' THEN
    PERFORM public.process_gamification_event(
      NEW.user_id,
      NEW.organization_id,
      NEW.action_key,
      NEW.quantity,
      NEW.id,
      jsonb_build_object(
        'source_module', 'manual_entry',
        'notes', NEW.notes,
        'approved_by', NEW.approved_by
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_manual_gamification_entry ON public.gamification_manual_entries;
CREATE TRIGGER tr_manual_gamification_entry
BEFORE UPDATE ON public.gamification_manual_entries
FOR EACH ROW EXECUTE FUNCTION public.handle_manual_gamification_entry();

WITH defaults(action_type, points) AS (
  VALUES
    ('call_made', 5),
    ('message_sent', 2),
    ('lead_created', 10),
    ('lead_created_manual', 10),
    ('visit_scheduled', 20),
    ('visit_confirmed', 35),
    ('meeting_scheduled', 10),
    ('meeting_held', 25),
    ('proposal_sent', 30),
    ('sale_closed', 500),
    ('contract_signed', 250),
    ('property_created', 50)
)
INSERT INTO public.gamification_rules (organization_id, action_type, points, is_active)
SELECT o.id, d.action_type, d.points, true
FROM public.organizations o
CROSS JOIN defaults d
ON CONFLICT (organization_id, action_type) DO NOTHING;

INSERT INTO public.user_gamification_stats (
  user_id,
  organization_id,
  total_points,
  xp,
  xp_total,
  current_level,
  xp_current_level,
  xp_next_level,
  rank_tier,
  current_rank
)
SELECT u.id, u.organization_id, 0, 0, 0, 1, 0, 100, 'Bronze I', 'Bronze I'
FROM public.users u
WHERE u.organization_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;
