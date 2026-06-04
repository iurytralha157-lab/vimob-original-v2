-- =============================================
-- Distribuição Automática de Leads via Round-Robin
-- =============================================

-- 1. Colunas faltantes nas tabelas existentes
ALTER TABLE public.round_robin_members ADD COLUMN IF NOT EXISTS leads_count INTEGER DEFAULT 0;
ALTER TABLE public.round_robin_rules ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.round_robin_rules ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
ALTER TABLE public.round_robin_rules ADD COLUMN IF NOT EXISTS match JSONB;
ALTER TABLE public.pipelines ADD COLUMN IF NOT EXISTS default_round_robin_id UUID REFERENCES public.round_robins(id) ON DELETE SET NULL;

-- 2. Adicionar colunas faltantes em assignments_log
ALTER TABLE public.assignments_log ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.assignments_log ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.assignments_log ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.assignments_log ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ DEFAULT now();

-- 3. Habilitar RLS em assignments_log
ALTER TABLE public.assignments_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their org assignments" ON public.assignments_log;
CREATE POLICY "Users can view their org assignments" ON public.assignments_log FOR ALL USING (organization_id = public.get_user_organization_id());

-- 4. Função disponibilidade
CREATE OR REPLACE FUNCTION public.is_member_available(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_availability RECORD; v_current_day INTEGER; v_current_time TIME;
BEGIN
  v_current_day := EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Sao_Paulo');
  v_current_time := (NOW() AT TIME ZONE 'America/Sao_Paulo')::TIME;
  SELECT * INTO v_availability FROM public.member_availability WHERE user_id = p_user_id AND day_of_week = v_current_day AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RETURN true; END IF;
  RETURN v_current_time BETWEEN v_availability.start_time AND v_availability.end_time;
END; $$;

-- 5. Função seleção round-robin
CREATE OR REPLACE FUNCTION public.pick_round_robin_for_lead(p_lead_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lead RECORD; v_rule RECORD; v_round_robin_id UUID; v_lead_source TEXT; v_lead_tags TEXT[];
BEGIN
  SELECT l.*, p.default_round_robin_id INTO v_lead FROM public.leads l LEFT JOIN public.pipelines p ON p.id = l.pipeline_id WHERE l.id = p_lead_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_lead_source := v_lead.source::TEXT;
  SELECT ARRAY_AGG(t.name) INTO v_lead_tags FROM public.lead_tags lt JOIN public.tags t ON t.id = lt.tag_id WHERE lt.lead_id = p_lead_id;
  FOR v_rule IN SELECT rr.id as round_robin_id, rrr.* FROM public.round_robin_rules rrr JOIN public.round_robins rr ON rr.id = rrr.round_robin_id WHERE rr.organization_id = v_lead.organization_id AND rr.is_active = true AND (rrr.is_active IS NULL OR rrr.is_active = true) ORDER BY COALESCE(rrr.priority, 0) DESC
  LOOP
    IF v_rule.match_type = 'source' AND v_lead_source = v_rule.match_value THEN RETURN v_rule.round_robin_id; END IF;
    IF v_rule.match_type = 'pipeline' AND v_lead.pipeline_id::TEXT = v_rule.match_value THEN RETURN v_rule.round_robin_id; END IF;
    IF v_rule.match_type = 'tag' AND v_lead_tags IS NOT NULL AND v_rule.match_value = ANY(v_lead_tags) THEN RETURN v_rule.round_robin_id; END IF;
  END LOOP;
  IF v_lead.default_round_robin_id IS NOT NULL THEN SELECT id INTO v_round_robin_id FROM public.round_robins WHERE id = v_lead.default_round_robin_id AND is_active = true; IF FOUND THEN RETURN v_round_robin_id; END IF; END IF;
  SELECT id INTO v_round_robin_id FROM public.round_robins WHERE organization_id = v_lead.organization_id AND is_active = true ORDER BY created_at ASC LIMIT 1;
  RETURN v_round_robin_id;
END; $$;

-- 6. Função principal distribuição (ATUALIZADA)
DROP FUNCTION IF EXISTS public.handle_lead_intake(UUID);
CREATE OR REPLACE FUNCTION public.handle_lead_intake(p_lead_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lead RECORD; v_round_robin RECORD; v_member RECORD; v_assigned_user_id UUID; v_round_robin_id UUID; v_total_weight INTEGER; v_random_weight INTEGER; v_cumulative_weight INTEGER := 0; v_first_stage_id UUID; v_pipeline RECORD; v_reason TEXT;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Lead not found'); END IF;
  IF v_lead.assigned_user_id IS NOT NULL THEN RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id, 'assigned_user_id', v_lead.assigned_user_id, 'round_robin_used', false); END IF;
  IF v_lead.pipeline_id IS NULL THEN SELECT id, default_round_robin_id INTO v_pipeline FROM public.pipelines WHERE organization_id = v_lead.organization_id ORDER BY created_at ASC LIMIT 1; IF FOUND THEN UPDATE public.leads SET pipeline_id = v_pipeline.id WHERE id = p_lead_id; v_lead.pipeline_id := v_pipeline.id; END IF; END IF;
  IF v_lead.stage_id IS NULL AND v_lead.pipeline_id IS NOT NULL THEN SELECT id INTO v_first_stage_id FROM public.stages WHERE pipeline_id = v_lead.pipeline_id ORDER BY position ASC LIMIT 1; IF FOUND THEN UPDATE public.leads SET stage_id = v_first_stage_id, stage_entered_at = NOW() WHERE id = p_lead_id; END IF; END IF;
  v_round_robin_id := public.pick_round_robin_for_lead(p_lead_id);
  IF v_round_robin_id IS NULL THEN RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id, 'assigned_user_id', NULL, 'round_robin_used', false, 'reason', 'No active round-robin'); END IF;
  SELECT * INTO v_round_robin FROM public.round_robins WHERE id = v_round_robin_id;
  IF v_round_robin.strategy = 'weighted' THEN
    SELECT SUM(COALESCE(weight, 1)) INTO v_total_weight FROM public.round_robin_members WHERE round_robin_id = v_round_robin_id AND public.is_member_available(user_id);
    IF v_total_weight > 0 THEN v_random_weight := floor(random() * v_total_weight)::INTEGER; FOR v_member IN SELECT * FROM public.round_robin_members WHERE round_robin_id = v_round_robin_id AND public.is_member_available(user_id) ORDER BY position ASC LOOP v_cumulative_weight := v_cumulative_weight + COALESCE(v_member.weight, 1); IF v_random_weight < v_cumulative_weight THEN v_assigned_user_id := v_member.user_id; v_reason := 'Weighted distribution'; EXIT; END IF; END LOOP; END IF;
  ELSE
    SELECT user_id INTO v_assigned_user_id FROM public.round_robin_members WHERE round_robin_id = v_round_robin_id AND public.is_member_available(user_id) ORDER BY COALESCE(leads_count, 0) ASC, position ASC LIMIT 1; v_reason := 'Simple round-robin';
  END IF;
  IF v_assigned_user_id IS NOT NULL THEN
    UPDATE public.leads SET assigned_user_id = v_assigned_user_id, assigned_at = NOW() WHERE id = p_lead_id;
    UPDATE public.round_robin_members SET leads_count = COALESCE(leads_count, 0) + 1 WHERE round_robin_id = v_round_robin_id AND user_id = v_assigned_user_id;
    INSERT INTO public.assignments_log (lead_id, user_id, assigned_user_id, round_robin_id, reason, organization_id, assigned_at) VALUES (p_lead_id, v_assigned_user_id, v_assigned_user_id, v_round_robin_id, v_reason, v_lead.organization_id, NOW());
    INSERT INTO public.activities (lead_id, organization_id, type, description, created_by) VALUES (p_lead_id, v_lead.organization_id, 'assignment', 'Lead atribuído automaticamente via round-robin', v_assigned_user_id);
    PERFORM public.create_notification(v_assigned_user_id, 'Novo lead atribuído', 'Você recebeu um novo lead: ' || COALESCE(v_lead.name, 'Sem nome'), 'info');
    RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id, 'assigned_user_id', v_assigned_user_id, 'round_robin_id', v_round_robin_id, 'round_robin_used', true, 'reason', v_reason);
  ELSE
    RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id, 'assigned_user_id', NULL, 'round_robin_used', false, 'reason', 'No available members');
  END IF;
END; $$;

-- 7. Trigger function
CREATE OR REPLACE FUNCTION public.trigger_handle_lead_intake() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN IF NEW.assigned_user_id IS NULL THEN PERFORM public.handle_lead_intake(NEW.id); END IF; RETURN NEW; END; $$;

-- 8. Trigger
DROP TRIGGER IF EXISTS trigger_lead_intake ON public.leads;
CREATE TRIGGER trigger_lead_intake AFTER INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.trigger_handle_lead_intake();

-- 9. Índices
CREATE INDEX IF NOT EXISTS idx_round_robin_members_leads_count ON public.round_robin_members(round_robin_id, leads_count);
CREATE INDEX IF NOT EXISTS idx_assignments_log_lead ON public.assignments_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_default_rr ON public.pipelines(default_round_robin_id) WHERE default_round_robin_id IS NOT NULL;