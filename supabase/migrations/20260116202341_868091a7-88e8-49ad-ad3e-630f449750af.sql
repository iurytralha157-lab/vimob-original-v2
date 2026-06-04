-- =====================================================
-- TABELA: lead_timeline_events
-- Registra todos os eventos na timeline do lead
-- =====================================================
CREATE TABLE IF NOT EXISTS public.lead_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  channel TEXT,
  is_automation BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comentários
COMMENT ON TABLE public.lead_timeline_events IS 'Eventos da timeline do lead para auditoria e métricas';
COMMENT ON COLUMN public.lead_timeline_events.event_type IS 'Tipos: lead_created, lead_assigned, whatsapp_message_sent, whatsapp_message_received, first_response, call_initiated, note_created, stage_changed';
COMMENT ON COLUMN public.lead_timeline_events.channel IS 'Canal: whatsapp, phone, email, manual';
COMMENT ON COLUMN public.lead_timeline_events.is_automation IS 'Se o evento foi gerado por automação';

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_lead_timeline_events_lead_id ON public.lead_timeline_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_timeline_events_event_at ON public.lead_timeline_events(event_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_timeline_events_event_type ON public.lead_timeline_events(event_type);
CREATE INDEX IF NOT EXISTS idx_lead_timeline_events_org_id ON public.lead_timeline_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_lead_timeline_events_lead_type ON public.lead_timeline_events(lead_id, event_type);

-- RLS
ALTER TABLE public.lead_timeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lead timeline events from their org"
  ON public.lead_timeline_events FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can insert timeline events in their org"
  ON public.lead_timeline_events FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id() OR public.is_super_admin());

CREATE POLICY "Super admin can manage all timeline events"
  ON public.lead_timeline_events FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_timeline_events;

-- =====================================================
-- COLUNAS: leads (métricas de primeira resposta)
-- =====================================================
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_response_seconds INTEGER;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_response_channel TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_response_actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_response_is_automation BOOLEAN DEFAULT false;

-- Índices para relatórios
CREATE INDEX IF NOT EXISTS idx_leads_first_response_at ON public.leads(first_response_at);
CREATE INDEX IF NOT EXISTS idx_leads_first_response_actor ON public.leads(first_response_actor_user_id);

-- =====================================================
-- COLUNAS: pipelines (configuração de first response)
-- =====================================================
ALTER TABLE public.pipelines ADD COLUMN IF NOT EXISTS first_response_start TEXT DEFAULT 'lead_created';
ALTER TABLE public.pipelines ADD COLUMN IF NOT EXISTS include_automation_in_first_response BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.pipelines.first_response_start IS 'Define quando o contador começa: lead_created ou lead_assigned';
COMMENT ON COLUMN public.pipelines.include_automation_in_first_response IS 'Se mensagens de automação contam como primeira resposta';

-- =====================================================
-- TRIGGER: log_lead_created
-- Cria evento quando lead é criado
-- =====================================================
CREATE OR REPLACE FUNCTION public.log_lead_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.lead_timeline_events (
    organization_id,
    lead_id,
    event_type,
    event_at,
    actor_user_id,
    metadata
  ) VALUES (
    NEW.organization_id,
    NEW.id,
    'lead_created',
    NEW.created_at,
    NULL,
    jsonb_build_object(
      'source', NEW.source,
      'pipeline_id', NEW.pipeline_id,
      'stage_id', NEW.stage_id,
      'name', NEW.name
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_log_lead_created ON public.leads;
CREATE TRIGGER trg_log_lead_created
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.log_lead_created();

-- =====================================================
-- TRIGGER: log_lead_assigned
-- Cria evento quando lead é atribuído
-- =====================================================
CREATE OR REPLACE FUNCTION public.log_lead_assigned()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.assigned_user_id IS DISTINCT FROM NEW.assigned_user_id) 
     AND NEW.assigned_user_id IS NOT NULL THEN
    INSERT INTO public.lead_timeline_events (
      organization_id,
      lead_id,
      event_type,
      event_at,
      actor_user_id,
      metadata
    ) VALUES (
      NEW.organization_id,
      NEW.id,
      'lead_assigned',
      now(),
      NEW.assigned_user_id,
      jsonb_build_object(
        'previous_user_id', OLD.assigned_user_id,
        'new_user_id', NEW.assigned_user_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_log_lead_assigned ON public.leads;
CREATE TRIGGER trg_log_lead_assigned
  AFTER UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.log_lead_assigned();

-- =====================================================
-- TRIGGER: log_stage_changed
-- Cria evento quando estágio muda
-- =====================================================
CREATE OR REPLACE FUNCTION public.log_stage_changed_timeline()
RETURNS TRIGGER AS $$
DECLARE
  old_stage_name TEXT;
  new_stage_name TEXT;
BEGIN
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    SELECT name INTO old_stage_name FROM public.stages WHERE id = OLD.stage_id;
    SELECT name INTO new_stage_name FROM public.stages WHERE id = NEW.stage_id;
    
    INSERT INTO public.lead_timeline_events (
      organization_id,
      lead_id,
      event_type,
      event_at,
      metadata
    ) VALUES (
      NEW.organization_id,
      NEW.id,
      'stage_changed',
      now(),
      jsonb_build_object(
        'old_stage_id', OLD.stage_id,
        'new_stage_id', NEW.stage_id,
        'old_stage_name', old_stage_name,
        'new_stage_name', new_stage_name
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_log_stage_changed_timeline ON public.leads;
CREATE TRIGGER trg_log_stage_changed_timeline
  AFTER UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.log_stage_changed_timeline();