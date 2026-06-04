-- =============================================
-- MIGRAÇÃO DE SEGURANÇA CONSOLIDADA (CORRIGIDA)
-- =============================================

-- =============================================
-- FASE 1: HABILITAR RLS EM TABELAS SEM PROTEÇÃO
-- =============================================

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_property_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_sla_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_proximities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_robin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_org_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

-- =============================================
-- FASE 2: POLÍTICAS PARA TOKENS OAUTH (CRÍTICO)
-- =============================================

CREATE POLICY "Users can view own google tokens" ON public.google_calendar_tokens
  FOR SELECT USING (user_id = auth.uid() OR public.is_super_admin());

CREATE POLICY "Users can insert own google tokens" ON public.google_calendar_tokens
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own google tokens" ON public.google_calendar_tokens
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own google tokens" ON public.google_calendar_tokens
  FOR DELETE USING (user_id = auth.uid());

-- =============================================
-- FASE 3: POLÍTICAS PARA DADOS FINANCEIROS
-- =============================================

-- financial_entries
CREATE POLICY "Org members can view financial entries" ON public.financial_entries
  FOR SELECT USING (
    organization_id = public.get_user_organization_id() 
    OR public.is_super_admin()
  );

CREATE POLICY "Admins can insert financial entries" ON public.financial_entries
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
  );

CREATE POLICY "Admins can update financial entries" ON public.financial_entries
  FOR UPDATE USING (
    organization_id = public.get_user_organization_id() 
    AND (public.is_admin() OR public.is_super_admin())
  );

CREATE POLICY "Admins can delete financial entries" ON public.financial_entries
  FOR DELETE USING (
    organization_id = public.get_user_organization_id() 
    AND (public.is_admin() OR public.is_super_admin())
  );

-- contracts
CREATE POLICY "Org members can view contracts" ON public.contracts
  FOR SELECT USING (
    organization_id = public.get_user_organization_id() 
    OR public.is_super_admin()
  );

CREATE POLICY "Users can insert contracts" ON public.contracts
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
  );

CREATE POLICY "Admins can update contracts" ON public.contracts
  FOR UPDATE USING (
    organization_id = public.get_user_organization_id() 
    AND (public.is_admin() OR public.is_super_admin())
  );

CREATE POLICY "Admins can delete contracts" ON public.contracts
  FOR DELETE USING (
    organization_id = public.get_user_organization_id() 
    AND (public.is_admin() OR public.is_super_admin())
  );

-- commissions
CREATE POLICY "Users can view own commissions" ON public.commissions
  FOR SELECT USING (
    user_id = auth.uid() 
    OR (organization_id = public.get_user_organization_id() AND public.is_admin())
    OR public.is_super_admin()
  );

CREATE POLICY "Admins can insert commissions" ON public.commissions
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id() 
    AND (public.is_admin() OR public.is_super_admin())
  );

CREATE POLICY "Admins can update commissions" ON public.commissions
  FOR UPDATE USING (
    organization_id = public.get_user_organization_id() 
    AND (public.is_admin() OR public.is_super_admin())
  );

CREATE POLICY "Admins can delete commissions" ON public.commissions
  FOR DELETE USING (
    organization_id = public.get_user_organization_id() 
    AND (public.is_admin() OR public.is_super_admin())
  );

-- =============================================
-- FASE 4: POLÍTICAS PARA AGENDA
-- =============================================

CREATE POLICY "Org members can view schedule events" ON public.schedule_events
  FOR SELECT USING (
    organization_id = public.get_user_organization_id() 
    OR public.is_super_admin()
  );

CREATE POLICY "Users can insert own events" ON public.schedule_events
  FOR INSERT WITH CHECK (
    user_id = auth.uid() 
    AND organization_id = public.get_user_organization_id()
  );

CREATE POLICY "Users can update own events" ON public.schedule_events
  FOR UPDATE USING (
    user_id = auth.uid() 
    OR (organization_id = public.get_user_organization_id() AND public.is_admin())
    OR public.is_super_admin()
  );

CREATE POLICY "Users can delete own events" ON public.schedule_events
  FOR DELETE USING (
    user_id = auth.uid() 
    OR (organization_id = public.get_user_organization_id() AND public.is_admin())
    OR public.is_super_admin()
  );

-- =============================================
-- FASE 5: POLÍTICAS PARA AUTOMAÇÕES
-- =============================================

CREATE POLICY "Org access to automations" ON public.automations
  FOR ALL USING (
    organization_id = public.get_user_organization_id() 
    OR public.is_super_admin()
  );

CREATE POLICY "Org access to automation_nodes" ON public.automation_nodes
  FOR ALL USING (
    automation_id IN (
      SELECT id FROM public.automations 
      WHERE organization_id = public.get_user_organization_id()
    )
    OR public.is_super_admin()
  );

CREATE POLICY "Org access to automation_edges" ON public.automation_edges
  FOR ALL USING (
    automation_id IN (
      SELECT id FROM public.automations 
      WHERE organization_id = public.get_user_organization_id()
    )
    OR public.is_super_admin()
  );

CREATE POLICY "Org access to automation_runs" ON public.automation_runs
  FOR ALL USING (
    automation_id IN (
      SELECT id FROM public.automations 
      WHERE organization_id = public.get_user_organization_id()
    )
    OR public.is_super_admin()
  );

-- =============================================
-- FASE 6: POLÍTICAS PARA HISTÓRICO DE LEADS
-- =============================================

CREATE POLICY "Org access to lead_assignment_history" ON public.lead_assignment_history
  FOR ALL USING (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = public.get_user_organization_id()
    )
    OR public.is_super_admin()
  );

CREATE POLICY "Org access to lead_stage_history" ON public.lead_stage_history
  FOR ALL USING (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = public.get_user_organization_id()
    )
    OR public.is_super_admin()
  );

CREATE POLICY "Org access to lead_timeline_events" ON public.lead_timeline_events
  FOR ALL USING (
    organization_id = public.get_user_organization_id() 
    OR public.is_super_admin()
  );

CREATE POLICY "Org access to lead_property_interests" ON public.lead_property_interests
  FOR ALL USING (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = public.get_user_organization_id()
    )
    OR public.is_super_admin()
  );

-- =============================================
-- FASE 7: POLÍTICAS PARA PROPRIEDADES
-- (property_features e property_proximities usam organization_id diretamente)
-- =============================================

CREATE POLICY "Org access to property_features" ON public.property_features
  FOR ALL USING (
    organization_id = public.get_user_organization_id()
    OR public.is_super_admin()
  );

CREATE POLICY "Org access to property_proximities" ON public.property_proximities
  FOR ALL USING (
    organization_id = public.get_user_organization_id()
    OR public.is_super_admin()
  );

-- =============================================
-- FASE 8: POLÍTICAS PARA CONFIGURAÇÕES
-- =============================================

-- pipeline_sla_settings
CREATE POLICY "Org access to pipeline_sla_settings" ON public.pipeline_sla_settings
  FOR ALL USING (
    pipeline_id IN (
      SELECT id FROM public.pipelines 
      WHERE organization_id = public.get_user_organization_id()
    )
    OR public.is_super_admin()
  );

-- stage_automations
CREATE POLICY "Org access to stage_automations" ON public.stage_automations
  FOR ALL USING (
    stage_id IN (
      SELECT s.id FROM public.stages s
      JOIN public.pipelines p ON p.id = s.pipeline_id
      WHERE p.organization_id = public.get_user_organization_id()
    )
    OR public.is_super_admin()
  );

-- organization_modules
CREATE POLICY "Org members can view modules" ON public.organization_modules
  FOR SELECT USING (
    organization_id = public.get_user_organization_id() 
    OR public.is_super_admin()
  );

CREATE POLICY "Super admin can manage modules" ON public.organization_modules
  FOR ALL USING (public.is_super_admin());

-- webhooks
CREATE POLICY "Org admins can view webhooks" ON public.webhooks
  FOR SELECT USING (
    organization_id = public.get_user_organization_id() 
    OR public.is_super_admin()
  );

CREATE POLICY "Org admins can manage webhooks" ON public.webhooks
  FOR ALL USING (
    (organization_id = public.get_user_organization_id() AND public.is_admin())
    OR public.is_super_admin()
  );

-- =============================================
-- FASE 9: POLÍTICAS PARA LOGS E CACHE
-- =============================================

-- audit_logs
CREATE POLICY "Super admin can view all audit logs" ON public.audit_logs
  FOR SELECT USING (public.is_super_admin());

CREATE POLICY "Org admins can view org audit logs" ON public.audit_logs
  FOR SELECT USING (
    organization_id = public.get_user_organization_id() 
    AND public.is_admin()
  );

CREATE POLICY "System can create audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (true);

-- round_robin_logs (usa organization_id diretamente)
CREATE POLICY "Org access to round_robin_logs" ON public.round_robin_logs
  FOR ALL USING (
    organization_id = public.get_user_organization_id()
    OR public.is_super_admin()
  );

-- user_org_cache
CREATE POLICY "Users can access own cache" ON public.user_org_cache
  FOR ALL USING (user_id = auth.uid() OR public.is_super_admin());