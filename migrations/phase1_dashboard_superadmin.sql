-- =====================================================================
-- FASE 1 — Dashboard SuperAdmin (centro de inteligência da plataforma)
-- =====================================================================
-- Execute na ordem dos blocos abaixo.

-- ---------------------------------------------------------------------
-- SQL 1 — Tabela platform_events (feed operacional append-only)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  actor_user_id uuid,
  type text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','success','warning','error','critical')),
  title text NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_events_created_at ON public.platform_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_events_type ON public.platform_events (type);
CREATE INDEX IF NOT EXISTS idx_platform_events_org ON public.platform_events (organization_id);

ALTER TABLE public.platform_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superadmin_read_platform_events" ON public.platform_events;
CREATE POLICY "superadmin_read_platform_events"
  ON public.platform_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'super_admin')
  );

DROP POLICY IF EXISTS "service_role_write_platform_events" ON public.platform_events;
CREATE POLICY "service_role_write_platform_events"
  ON public.platform_events FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ---------------------------------------------------------------------
-- SQL 2 — Triggers para alimentar platform_events automaticamente
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_platform_event_org_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.platform_events (organization_id, type, severity, title, description, metadata)
  VALUES (
    NEW.id,
    'organization_created',
    'success',
    'Nova organização criada',
    NEW.name,
    jsonb_build_object('subscription_type', NEW.subscription_type, 'plan_id', NEW.plan_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_event_org_created ON public.organizations;
CREATE TRIGGER trg_platform_event_org_created
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.log_platform_event_org_created();

CREATE OR REPLACE FUNCTION public.log_platform_event_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.platform_events (organization_id, type, severity, title, description, metadata)
    VALUES (
      NEW.organization_id,
      'payment_received',
      'success',
      'Pagamento recebido',
      COALESCE(NEW.description, 'Pagamento confirmado'),
      jsonb_build_object('amount', NEW.paid_amount, 'entry_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_event_payment ON public.financial_entries;
CREATE TRIGGER trg_platform_event_payment
  AFTER UPDATE OF status ON public.financial_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_platform_event_payment();

CREATE OR REPLACE FUNCTION public.log_platform_event_automation_failed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  IF NEW.status = 'failed' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT organization_id INTO v_org FROM public.automations WHERE id = NEW.automation_id;
    INSERT INTO public.platform_events (organization_id, type, severity, title, description, metadata)
    VALUES (
      v_org,
      'automation_failed',
      'error',
      'Automação falhou',
      LEFT(COALESCE(NEW.error_message, 'Erro desconhecido'), 240),
      jsonb_build_object('automation_id', NEW.automation_id, 'run_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_event_automation_failed ON public.automation_runs;
CREATE TRIGGER trg_platform_event_automation_failed
  AFTER UPDATE OF status ON public.automation_runs
  FOR EACH ROW EXECUTE FUNCTION public.log_platform_event_automation_failed();

-- ---------------------------------------------------------------------
-- SQL 3 — RPC admin_dashboard_overview(period_days)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_dashboard_overview(p_period_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super boolean;
  v_now timestamptz := now();
  v_period_start timestamptz := now() - make_interval(days => p_period_days);
  v_prev_start  timestamptz := now() - make_interval(days => p_period_days * 2);
  v_result jsonb;
  v_mrr numeric := 0;
  v_revenue_period numeric := 0;
  v_revenue_prev numeric := 0;
  v_forecast numeric := 0;
  v_avg_ticket numeric := 0;
  v_overdue_total numeric := 0;
  v_total_orgs int := 0;
  v_active_orgs int := 0;
  v_trial_orgs int := 0;
  v_cancelled_orgs int := 0;
  v_active_users_today int := 0;
  v_leads_today int := 0;
  v_automations_today int := 0;
  v_activities_today int := 0;
  v_errors_recent int := 0;
  v_accesses_today int := 0;
  v_orgs_growth numeric := 0;
  v_revenue_growth numeric := 0;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin')
    INTO v_is_super;
  IF NOT v_is_super THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- MRR (soma das mensalidades das orgs pagas com plano ativo)
  SELECT COALESCE(SUM(p.price), 0) INTO v_mrr
  FROM public.organizations o
  JOIN public.admin_subscription_plans p ON p.id = o.plan_id
  WHERE o.subscription_type = 'paid' AND o.is_active = true;

  -- Receita período / período anterior
  SELECT COALESCE(SUM(COALESCE(paid_amount, amount)), 0) INTO v_revenue_period
  FROM public.financial_entries
  WHERE status = 'paid' AND type = 'income'
    AND paid_date >= v_period_start::date;

  SELECT COALESCE(SUM(COALESCE(paid_amount, amount)), 0) INTO v_revenue_prev
  FROM public.financial_entries
  WHERE status = 'paid' AND type = 'income'
    AND paid_date >= v_prev_start::date AND paid_date < v_period_start::date;

  -- Receita prevista (entradas pendentes vencendo no período)
  SELECT COALESCE(SUM(amount), 0) INTO v_forecast
  FROM public.financial_entries
  WHERE status IN ('pending','overdue') AND type = 'income'
    AND due_date BETWEEN current_date AND (current_date + (p_period_days || ' days')::interval)::date;

  -- Ticket médio (últimos 90d)
  SELECT COALESCE(AVG(COALESCE(paid_amount, amount)), 0) INTO v_avg_ticket
  FROM public.financial_entries
  WHERE status = 'paid' AND type = 'income'
    AND paid_date >= (current_date - 90);

  -- Inadimplência total
  SELECT COALESCE(SUM(amount), 0) INTO v_overdue_total
  FROM public.financial_entries
  WHERE status IN ('pending','overdue') AND type = 'income'
    AND due_date < current_date;

  -- Contadores de organizações
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE is_active = true AND subscription_status = 'active'),
    COUNT(*) FILTER (WHERE subscription_type = 'trial' AND is_active = true),
    COUNT(*) FILTER (WHERE is_active = false OR subscription_status = 'cancelled')
  INTO v_total_orgs, v_active_orgs, v_trial_orgs, v_cancelled_orgs
  FROM public.organizations;

  -- Acessos / usuários ativos hoje (via audit_logs como proxy)
  SELECT COUNT(DISTINCT user_id) INTO v_active_users_today
  FROM public.audit_logs WHERE created_at >= current_date;

  SELECT COUNT(*) INTO v_accesses_today
  FROM public.audit_logs WHERE created_at >= current_date AND action IN ('login','session.start');

  -- Operacional hoje
  SELECT COUNT(*) INTO v_leads_today FROM public.leads WHERE created_at >= current_date;
  SELECT COUNT(*) INTO v_automations_today FROM public.automation_runs WHERE started_at >= current_date;
  SELECT COUNT(*) INTO v_activities_today FROM public.audit_logs WHERE created_at >= current_date;
  SELECT COUNT(*) INTO v_errors_recent
  FROM public.platform_events
  WHERE severity IN ('error','critical') AND created_at >= (now() - interval '24 hours');

  -- Crescimento %
  IF v_revenue_prev > 0 THEN v_revenue_growth := ROUND(((v_revenue_period - v_revenue_prev) / v_revenue_prev) * 100, 1); END IF;

  -- Crescimento de organizações no período vs anterior
  WITH a AS (
    SELECT COUNT(*) AS c FROM public.organizations WHERE created_at >= v_period_start
  ), b AS (
    SELECT COUNT(*) AS c FROM public.organizations WHERE created_at >= v_prev_start AND created_at < v_period_start
  )
  SELECT CASE WHEN b.c > 0 THEN ROUND(((a.c - b.c)::numeric / b.c) * 100, 1) ELSE 0 END
    INTO v_orgs_growth FROM a, b;

  v_result := jsonb_build_object(
    'period_days', p_period_days,
    'financial', jsonb_build_object(
      'mrr', v_mrr,
      'revenue_period', v_revenue_period,
      'revenue_forecast', v_forecast,
      'avg_ticket', v_avg_ticket,
      'overdue_total', v_overdue_total,
      'revenue_growth_pct', v_revenue_growth
    ),
    'platform', jsonb_build_object(
      'total_orgs', v_total_orgs,
      'active_orgs', v_active_orgs,
      'trial_orgs', v_trial_orgs,
      'cancelled_orgs', v_cancelled_orgs,
      'active_users_today', v_active_users_today,
      'orgs_growth_pct', v_orgs_growth
    ),
    'operational', jsonb_build_object(
      'leads_today', v_leads_today,
      'automations_today', v_automations_today,
      'activities_today', v_activities_today,
      'errors_recent', v_errors_recent,
      'accesses_today', v_accesses_today
    )
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_dashboard_overview(integer) TO authenticated;

-- ---------------------------------------------------------------------
-- SQL 4 — RPC admin_dashboard_timeseries(period_days)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_dashboard_timeseries(p_period_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super boolean;
  v_start date := (current_date - p_period_days);
  v_revenue jsonb;
  v_orgs jsonb;
  v_usage jsonb;
  v_health jsonb;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin')
    INTO v_is_super;
  IF NOT v_is_super THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH days AS (
    SELECT generate_series(v_start, current_date, '1 day'::interval)::date AS d
  )
  SELECT jsonb_agg(jsonb_build_object(
    'date', d.d,
    'value', COALESCE(SUM(COALESCE(fe.paid_amount, fe.amount)), 0)
  ) ORDER BY d.d)
  INTO v_revenue
  FROM days d
  LEFT JOIN public.financial_entries fe
    ON fe.paid_date = d.d AND fe.status='paid' AND fe.type='income'
  GROUP BY d.d
  ORDER BY d.d;

  WITH days AS (SELECT generate_series(v_start, current_date, '1 day'::interval)::date AS d)
  SELECT jsonb_agg(jsonb_build_object(
    'date', d.d,
    'created', (SELECT COUNT(*) FROM public.organizations o WHERE o.created_at::date = d.d),
    'trial', (SELECT COUNT(*) FROM public.organizations o WHERE o.created_at::date = d.d AND o.subscription_type='trial'),
    'cancelled', (SELECT COUNT(*) FROM public.organizations o WHERE o.updated_at::date = d.d AND (o.is_active=false OR o.subscription_status='cancelled'))
  ) ORDER BY d.d) INTO v_orgs FROM days d;

  WITH days AS (SELECT generate_series(v_start, current_date, '1 day'::interval)::date AS d)
  SELECT jsonb_agg(jsonb_build_object(
    'date', d.d,
    'leads', (SELECT COUNT(*) FROM public.leads l WHERE l.created_at::date = d.d),
    'accesses', (SELECT COUNT(DISTINCT user_id) FROM public.audit_logs a WHERE a.created_at::date = d.d),
    'automations', (SELECT COUNT(*) FROM public.automation_runs ar WHERE ar.started_at::date = d.d)
  ) ORDER BY d.d) INTO v_usage FROM days d;

  SELECT jsonb_build_object(
    'active', (SELECT COUNT(*) FROM public.organizations WHERE is_active=true AND subscription_status='active' AND subscription_type='paid'),
    'trial', (SELECT COUNT(*) FROM public.organizations WHERE subscription_type='trial' AND is_active=true),
    'overdue', (SELECT COUNT(DISTINCT o.id) FROM public.organizations o JOIN public.financial_entries fe ON fe.organization_id=o.id WHERE fe.status IN ('pending','overdue') AND fe.type='income' AND fe.due_date < current_date),
    'cancelled', (SELECT COUNT(*) FROM public.organizations WHERE is_active=false OR subscription_status='cancelled')
  ) INTO v_health;

  RETURN jsonb_build_object(
    'revenue', COALESCE(v_revenue, '[]'::jsonb),
    'orgs', COALESCE(v_orgs, '[]'::jsonb),
    'usage', COALESCE(v_usage, '[]'::jsonb),
    'health', v_health
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_dashboard_timeseries(integer) TO authenticated;

-- ---------------------------------------------------------------------
-- SQL 5 — RPC admin_dashboard_pending_boards()
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_dashboard_pending_boards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super boolean;
  v_overdue jsonb; v_idle jsonb; v_issues jsonb; v_trials jsonb;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin')
    INTO v_is_super;
  IF NOT v_is_super THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT jsonb_agg(row_to_json(t)) INTO v_overdue FROM (
    SELECT o.id, o.name, MIN(fe.due_date) AS oldest_due,
           (current_date - MIN(fe.due_date))::int AS days_overdue,
           SUM(fe.amount) AS amount_due
    FROM public.organizations o
    JOIN public.financial_entries fe ON fe.organization_id = o.id
    WHERE fe.type='income' AND fe.status IN ('pending','overdue') AND fe.due_date < current_date
    GROUP BY o.id, o.name
    ORDER BY oldest_due ASC
    LIMIT 10
  ) t;

  SELECT jsonb_agg(row_to_json(t)) INTO v_idle FROM (
    SELECT o.id, o.name, o.last_access_at,
           CASE WHEN o.last_access_at IS NULL THEN NULL
                ELSE (current_date - o.last_access_at::date)::int END AS days_idle
    FROM public.organizations o
    WHERE o.is_active = true
      AND (o.last_access_at IS NULL OR o.last_access_at < (now() - interval '14 days'))
    ORDER BY o.last_access_at NULLS FIRST
    LIMIT 10
  ) t;

  SELECT jsonb_agg(row_to_json(t)) INTO v_issues FROM (
    SELECT pe.id, pe.organization_id, o.name AS organization_name,
           pe.type, pe.severity, pe.title, pe.description, pe.created_at
    FROM public.platform_events pe
    LEFT JOIN public.organizations o ON o.id = pe.organization_id
    WHERE pe.severity IN ('error','critical')
      AND pe.created_at >= (now() - interval '7 days')
    ORDER BY pe.created_at DESC
    LIMIT 10
  ) t;

  SELECT jsonb_agg(row_to_json(t)) INTO v_trials FROM (
    SELECT o.id, o.name, o.trial_ends_at,
           GREATEST(0, (o.trial_ends_at::date - current_date))::int AS days_left,
           o.telefone, o.whatsapp, o.email
    FROM public.organizations o
    WHERE o.subscription_type='trial' AND o.is_active = true
      AND o.trial_ends_at IS NOT NULL
      AND o.trial_ends_at <= (now() + interval '10 days')
    ORDER BY o.trial_ends_at ASC
    LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'overdue', COALESCE(v_overdue, '[]'::jsonb),
    'idle', COALESCE(v_idle, '[]'::jsonb),
    'issues', COALESCE(v_issues, '[]'::jsonb),
    'trials', COALESCE(v_trials, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_dashboard_pending_boards() TO authenticated;

-- ---------------------------------------------------------------------
-- SQL 6 — RPC admin_dashboard_feed(p_limit)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_dashboard_feed(p_limit integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super boolean;
  v_result jsonb;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin')
    INTO v_is_super;
  IF NOT v_is_super THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC) INTO v_result FROM (
    SELECT pe.id, pe.organization_id, o.name AS organization_name,
           pe.type, pe.severity, pe.title, pe.description, pe.metadata, pe.created_at
    FROM public.platform_events pe
    LEFT JOIN public.organizations o ON o.id = pe.organization_id
    ORDER BY pe.created_at DESC
    LIMIT p_limit
  ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_dashboard_feed(integer) TO authenticated;

-- =====================================================================
-- FIM DA FASE 1
-- =====================================================================
