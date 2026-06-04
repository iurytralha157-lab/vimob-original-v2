-- =====================================================
-- PARTE 4: Função get_sla_start_at
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_sla_start_at(p_lead_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lead RECORD;
  v_pipeline RECORD;
  v_start_at timestamptz;
  v_assigned_event timestamptz;
BEGIN
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF v_lead IS NULL THEN RETURN NULL; END IF;
  
  -- Buscar config do pipeline
  SELECT first_response_start INTO v_pipeline FROM pipelines WHERE id = v_lead.pipeline_id;
  
  IF v_pipeline.first_response_start = 'lead_assigned' THEN
    -- Buscar primeiro evento de atribuição
    SELECT MIN(event_at) INTO v_assigned_event
    FROM lead_timeline_events
    WHERE lead_id = p_lead_id AND event_type = 'lead_assigned';
    v_start_at := COALESCE(v_assigned_event, v_lead.created_at);
  ELSIF v_pipeline.first_response_start = 'stage_entered' THEN
    v_start_at := COALESCE(v_lead.stage_entered_at, v_lead.created_at);
  ELSE
    -- Default: lead_created
    v_start_at := v_lead.created_at;
  END IF;
  
  RETURN v_start_at;
END;
$$;

-- =====================================================
-- PARTE 5: Função para buscar leads pendentes de SLA
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_sla_pending_leads()
RETURNS TABLE (
  lead_id uuid,
  organization_id uuid,
  pipeline_id uuid,
  assigned_user_id uuid,
  lead_name text,
  sla_start_at timestamptz,
  current_sla_status text,
  warn_after_seconds int,
  overdue_after_seconds int,
  notify_assignee boolean,
  notify_manager boolean,
  sla_notified_warning_at timestamptz,
  sla_notified_overdue_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id as lead_id,
    l.organization_id,
    l.pipeline_id,
    l.assigned_user_id,
    l.name as lead_name,
    public.get_sla_start_at(l.id) as sla_start_at,
    l.sla_status as current_sla_status,
    COALESCE(s.warn_after_seconds, 180) as warn_after_seconds,
    COALESCE(s.overdue_after_seconds, 300) as overdue_after_seconds,
    COALESCE(s.notify_assignee, true) as notify_assignee,
    COALESCE(s.notify_manager, true) as notify_manager,
    l.sla_notified_warning_at,
    l.sla_notified_overdue_at
  FROM leads l
  INNER JOIN pipeline_sla_settings s ON s.pipeline_id = l.pipeline_id AND s.is_active = true
  WHERE l.first_response_at IS NULL
    AND (l.sla_last_checked_at IS NULL OR l.sla_last_checked_at < now() - interval '1 minute');
END;
$$;

-- =====================================================
-- PARTE 6: Função para métricas de SLA por usuário
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_sla_performance_by_user(
  p_organization_id uuid,
  p_start_date timestamptz DEFAULT now() - interval '30 days',
  p_end_date timestamptz DEFAULT now(),
  p_pipeline_id uuid DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  user_name text,
  total_leads bigint,
  responded_in_time bigint,
  responded_late bigint,
  pending_response bigint,
  overdue_count bigint,
  avg_response_seconds numeric,
  avg_first_touch_seconds numeric,
  sla_compliance_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id as user_id,
    u.name as user_name,
    COUNT(l.id) as total_leads,
    COUNT(l.id) FILTER (WHERE l.first_response_at IS NOT NULL AND l.first_response_seconds <= COALESCE(s.first_response_target_seconds, 300)) as responded_in_time,
    COUNT(l.id) FILTER (WHERE l.first_response_at IS NOT NULL AND l.first_response_seconds > COALESCE(s.first_response_target_seconds, 300)) as responded_late,
    COUNT(l.id) FILTER (WHERE l.first_response_at IS NULL) as pending_response,
    COUNT(l.id) FILTER (WHERE l.sla_status = 'overdue') as overdue_count,
    ROUND(AVG(l.first_response_seconds) FILTER (WHERE l.first_response_at IS NOT NULL), 0) as avg_response_seconds,
    ROUND(AVG(l.first_touch_seconds) FILTER (WHERE l.first_touch_at IS NOT NULL), 0) as avg_first_touch_seconds,
    ROUND(
      (COUNT(l.id) FILTER (WHERE l.first_response_at IS NOT NULL AND l.first_response_seconds <= COALESCE(s.first_response_target_seconds, 300))::numeric / 
       NULLIF(COUNT(l.id) FILTER (WHERE l.first_response_at IS NOT NULL), 0)::numeric) * 100
    , 1) as sla_compliance_rate
  FROM users u
  LEFT JOIN leads l ON l.assigned_user_id = u.id 
    AND l.created_at >= p_start_date 
    AND l.created_at <= p_end_date
    AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id)
  LEFT JOIN pipeline_sla_settings s ON s.pipeline_id = l.pipeline_id
  WHERE u.organization_id = p_organization_id
    AND u.role IN ('broker', 'admin', 'manager')
  GROUP BY u.id, u.name
  HAVING COUNT(l.id) > 0
  ORDER BY sla_compliance_rate DESC NULLS LAST, avg_response_seconds ASC NULLS LAST;
END;
$$;