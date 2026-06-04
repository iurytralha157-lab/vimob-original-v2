-- =====================================================================
-- FASE 2 — Gestão de Organizações (SaaS Premium)
-- =====================================================================

-- RPC para listagem avançada de organizações com metadados operacionais
CREATE OR REPLACE FUNCTION public.admin_list_organizations(
  p_search text DEFAULT '',
  p_status text DEFAULT 'all',
  p_segment text DEFAULT 'all'
)
RETURNS TABLE (
  id uuid,
  name text,
  logo_url text,
  is_active boolean,
  subscription_status text,
  subscription_type text,
  segment text,
  created_at timestamptz,
  last_access_at timestamptz,
  user_count bigint,
  lead_count bigint,
  automation_count bigint,
  mrr numeric,
  health_score int,
  days_trial_left int,
  overdue_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin')
    INTO v_is_super;
  IF NOT v_is_super THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  SELECT 
    o.id,
    o.name,
    o.logo_url,
    o.is_active,
    o.subscription_status,
    o.subscription_type,
    o.segment,
    o.created_at,
    o.last_access_at,
    (SELECT COUNT(*) FROM public.users u WHERE u.organization_id = o.id)::bigint,
    (SELECT COUNT(*) FROM public.leads l WHERE l.organization_id = o.id)::bigint,
    (SELECT COUNT(*) FROM public.automations a WHERE a.organization_id = o.id)::bigint,
    COALESCE(p.price, 0) as mrr,
    -- Health score simplificado (0-100) baseado em uso recente
    CASE 
      WHEN o.last_access_at >= (now() - interval '3 days') THEN 100
      WHEN o.last_access_at >= (now() - interval '7 days') THEN 70
      WHEN o.last_access_at >= (now() - interval '14 days') THEN 40
      ELSE 10
    END as health_score,
    CASE 
      WHEN o.subscription_type = 'trial' AND o.trial_ends_at IS NOT NULL 
      THEN GREATEST(0, (o.trial_ends_at::date - current_date))::int
      ELSE 0
    END as days_trial_left,
    COALESCE((
      SELECT SUM(amount) FROM public.financial_entries fe 
      WHERE fe.organization_id = o.id AND fe.status IN ('pending','overdue') AND fe.type='income' AND fe.due_date < current_date
    ), 0) as overdue_amount
  FROM public.organizations o
  LEFT JOIN public.admin_subscription_plans p ON p.id = o.plan_id
  WHERE 
    (p_search = '' OR o.name ILIKE '%' || p_search || '%' OR o.email ILIKE '%' || p_search || '%')
    AND (p_status = 'all' OR o.subscription_status = p_status OR (p_status = 'inactive' AND o.is_active = false))
    AND (p_segment = 'all' OR o.segment = p_segment)
  ORDER BY o.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_organizations(text, text, text) TO authenticated;
