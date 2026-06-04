-- Tabela para configurações de automações por estágio
CREATE TABLE public.stage_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  
  -- Tipo de automação: 'move_after_inactivity', 'send_whatsapp_on_enter', 'alert_on_inactivity'
  automation_type text NOT NULL,
  
  -- Configurações específicas
  trigger_days integer, -- dias de inatividade para disparar
  target_stage_id uuid REFERENCES public.stages(id), -- estágio destino (para move)
  whatsapp_template text, -- template de mensagem (variáveis: {{lead_name}}, {{stage_name}})
  alert_message text, -- mensagem do alerta
  
  -- Controle
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Constraint para garantir tipo válido
  CONSTRAINT valid_automation_type CHECK (automation_type IN ('move_after_inactivity', 'send_whatsapp_on_enter', 'alert_on_inactivity'))
);

-- Tabela para log de execução de automações
CREATE TABLE public.automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid REFERENCES public.stage_automations(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action_taken text NOT NULL,
  details jsonb,
  executed_at timestamptz DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_stage_automations_stage ON public.stage_automations(stage_id);
CREATE INDEX idx_stage_automations_org ON public.stage_automations(organization_id);
CREATE INDEX idx_stage_automations_active ON public.stage_automations(is_active) WHERE is_active = true;
CREATE INDEX idx_automation_logs_automation ON public.automation_logs(automation_id);
CREATE INDEX idx_automation_logs_lead ON public.automation_logs(lead_id);
CREATE INDEX idx_automation_logs_executed ON public.automation_logs(executed_at);

-- Trigger para updated_at
CREATE TRIGGER update_stage_automations_updated_at
  BEFORE UPDATE ON public.stage_automations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS para stage_automations
ALTER TABLE public.stage_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view automations from their organization"
  ON public.stage_automations FOR SELECT
  USING (organization_id = public.get_user_organization_id() OR public.is_super_admin());

CREATE POLICY "Admins can manage automations"
  ON public.stage_automations FOR ALL
  USING (
    (organization_id = public.get_user_organization_id() AND public.is_admin())
    OR public.is_super_admin()
  );

-- RLS para automation_logs
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view automation logs from their organization"
  ON public.automation_logs FOR SELECT
  USING (organization_id = public.get_user_organization_id() OR public.is_super_admin());

CREATE POLICY "System can insert automation logs"
  ON public.automation_logs FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id() OR public.is_super_admin());