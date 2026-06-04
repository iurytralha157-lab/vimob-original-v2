-- =====================================================
-- PARTE 1: Tabela pipeline_sla_settings
-- =====================================================

CREATE TABLE public.pipeline_sla_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pipeline_id uuid UNIQUE NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  first_response_target_seconds int DEFAULT 300,
  warn_after_seconds int DEFAULT 180,
  overdue_after_seconds int DEFAULT 300,
  notify_assignee boolean DEFAULT true,
  notify_manager boolean DEFAULT true,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger para updated_at
CREATE TRIGGER update_pipeline_sla_settings_updated_at
  BEFORE UPDATE ON public.pipeline_sla_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.pipeline_sla_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view SLA settings of their organization"
  ON public.pipeline_sla_settings FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Admins can manage SLA settings"
  ON public.pipeline_sla_settings FOR ALL
  USING (
    organization_id = public.get_user_organization_id() 
    AND public.is_admin()
  );

-- Índice
CREATE INDEX idx_pipeline_sla_settings_org ON public.pipeline_sla_settings(organization_id);