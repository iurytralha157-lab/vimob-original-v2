-- =============================================
-- CORREÇÃO DE FUNÇÕES SECURITY DEFINER
-- Adicionar SET search_path = public para prevenir ataques de schema hijacking
-- =============================================

-- Corrigir is_team_leader (sem parâmetro)
CREATE OR REPLACE FUNCTION public.is_team_leader()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = auth.uid() AND is_leader = true
  )
$$;

-- Corrigir is_team_leader (com parâmetro)
CREATE OR REPLACE FUNCTION public.is_team_leader(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.leader_id = check_user_id
  );
END;
$$;

-- Corrigir get_team_member_ids
CREATE OR REPLACE FUNCTION public.get_team_member_ids(p_team_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member_ids uuid[];
BEGIN
  SELECT ARRAY_AGG(tm.user_id)
  INTO member_ids
  FROM public.team_members tm
  WHERE tm.team_id = p_team_id;
  
  RETURN COALESCE(member_ids, ARRAY[]::uuid[]);
END;
$$;

-- Corrigir can_access_lead
CREATE OR REPLACE FUNCTION public.can_access_lead(p_lead_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_org_id uuid;
  v_lead_assigned_to uuid;
  v_user_org_id uuid;
  v_is_admin boolean;
BEGIN
  SELECT l.organization_id, l.assigned_user_id
  INTO v_lead_org_id, v_lead_assigned_to
  FROM public.leads l
  WHERE l.id = p_lead_id;
  
  IF v_lead_org_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  SELECT u.organization_id INTO v_user_org_id
  FROM public.users u
  WHERE u.id = p_user_id;
  
  IF v_user_org_id IS NULL OR v_user_org_id != v_lead_org_id THEN
    RETURN FALSE;
  END IF;
  
  IF public.is_super_admin() OR public.is_admin() THEN
    RETURN TRUE;
  END IF;
  
  IF v_lead_assigned_to = p_user_id THEN
    RETURN TRUE;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM public.teams t
    JOIN public.team_members tm ON tm.team_id = t.id
    WHERE t.leader_id = p_user_id
    AND tm.user_id = v_lead_assigned_to
  ) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;

-- Corrigir can_access_whatsapp_session
CREATE OR REPLACE FUNCTION public.can_access_whatsapp_session(p_session_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_org_id uuid;
  v_user_org_id uuid;
BEGIN
  IF public.is_super_admin() THEN
    RETURN TRUE;
  END IF;
  
  SELECT ws.organization_id INTO v_session_org_id
  FROM public.whatsapp_sessions ws
  WHERE ws.id = p_session_id;
  
  IF v_session_org_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  SELECT u.organization_id INTO v_user_org_id
  FROM public.users u
  WHERE u.id = p_user_id;
  
  IF v_user_org_id != v_session_org_id THEN
    RETURN FALSE;
  END IF;
  
  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;
  
  RETURN EXISTS (
    SELECT 1 FROM public.whatsapp_session_access wsa
    WHERE wsa.session_id = p_session_id
    AND wsa.user_id = p_user_id
  );
END;
$$;

-- Corrigir get_telephony_metrics
CREATE OR REPLACE FUNCTION public.get_telephony_metrics(
  p_organization_id uuid, 
  p_start_date timestamp with time zone DEFAULT NULL, 
  p_end_date timestamp with time zone DEFAULT NULL, 
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE(total_calls bigint, answered_calls bigint, missed_calls bigint, total_duration bigint, avg_duration numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::bigint as total_calls,
    COUNT(*) FILTER (WHERE tc.status = 'answered')::bigint as answered_calls,
    COUNT(*) FILTER (WHERE tc.status IN ('missed', 'no-answer'))::bigint as missed_calls,
    COALESCE(SUM(tc.duration), 0)::bigint as total_duration,
    COALESCE(AVG(tc.duration) FILTER (WHERE tc.duration > 0), 0)::numeric as avg_duration
  FROM public.telephony_calls tc
  WHERE tc.organization_id = p_organization_id
    AND (p_start_date IS NULL OR tc.initiated_at >= p_start_date)
    AND (p_end_date IS NULL OR tc.initiated_at <= p_end_date)
    AND (p_user_id IS NULL OR tc.user_id = p_user_id);
END;
$$;

-- Corrigir get_telephony_ranking
CREATE OR REPLACE FUNCTION public.get_telephony_ranking(
  p_organization_id uuid, 
  p_start_date timestamp with time zone DEFAULT NULL, 
  p_end_date timestamp with time zone DEFAULT NULL, 
  p_limit integer DEFAULT 10
)
RETURNS TABLE(user_id uuid, user_name text, total_calls bigint, answered_calls bigint, total_duration bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tc.user_id,
    u.name as user_name,
    COUNT(*)::bigint as total_calls,
    COUNT(*) FILTER (WHERE tc.status = 'answered')::bigint as answered_calls,
    COALESCE(SUM(tc.duration), 0)::bigint as total_duration
  FROM public.telephony_calls tc
  JOIN public.users u ON u.id = tc.user_id
  WHERE tc.organization_id = p_organization_id
    AND (p_start_date IS NULL OR tc.initiated_at >= p_start_date)
    AND (p_end_date IS NULL OR tc.initiated_at <= p_end_date)
  GROUP BY tc.user_id, u.name
  ORDER BY total_calls DESC
  LIMIT p_limit;
END;
$$;

-- Corrigir create_notification
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid, 
  p_title text, 
  p_content text, 
  p_type text DEFAULT 'info', 
  p_reference_type text DEFAULT NULL, 
  p_reference_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.users WHERE id = p_user_id;
  
  INSERT INTO public.notifications (
    user_id,
    organization_id,
    title,
    content,
    type,
    is_read
  ) VALUES (
    p_user_id,
    v_org_id,
    p_title,
    p_content,
    p_type,
    false
  )
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- Corrigir sync_user_roles trigger function
CREATE OR REPLACE FUNCTION public.sync_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, NEW.role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
    DELETE FROM public.user_roles WHERE user_id = NEW.id AND role = OLD.role;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, NEW.role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Corrigir handle_lead_intake trigger function
CREATE OR REPLACE FUNCTION public.handle_lead_intake()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage_id uuid;
  v_pipeline_id uuid;
BEGIN
  IF NEW.stage_id IS NULL AND NEW.pipeline_id IS NOT NULL THEN
    SELECT id INTO v_stage_id
    FROM public.stages
    WHERE pipeline_id = NEW.pipeline_id
    ORDER BY position ASC
    LIMIT 1;
    
    IF v_stage_id IS NOT NULL THEN
      NEW.stage_id := v_stage_id;
    END IF;
  END IF;
  
  IF NEW.stage_id IS NOT NULL AND NEW.pipeline_id IS NULL THEN
    SELECT pipeline_id INTO v_pipeline_id
    FROM public.stages
    WHERE id = NEW.stage_id;
    
    IF v_pipeline_id IS NOT NULL THEN
      NEW.pipeline_id := v_pipeline_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- =============================================
-- CORRIGIR POLÍTICA PERMISSIVA DE AUDIT_LOGS
-- =============================================

-- Remover política que usa WITH CHECK (true)
DROP POLICY IF EXISTS "System can create audit logs" ON public.audit_logs;

-- Criar política mais restritiva para inserção de logs
CREATE POLICY "Authenticated users can create audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL 
    OR current_setting('request.jwt.claim.role', true) = 'service_role'
  );