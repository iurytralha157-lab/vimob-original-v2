-- Tabela principal de eventos/atividades da agenda
CREATE TABLE public.schedule_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Informações do evento
  title text NOT NULL,
  description text,
  event_type text NOT NULL CHECK (event_type IN ('call', 'email', 'meeting', 'task', 'message', 'visit')),
  
  -- Data e hora
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  duration_minutes integer DEFAULT 30,
  all_day boolean DEFAULT false,
  
  -- Status
  is_completed boolean DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.users(id),
  
  -- Integração Google Calendar
  google_event_id text,
  google_calendar_id text,
  
  -- Origem (manual, cadence, etc)
  source text DEFAULT 'manual',
  cadence_task_id uuid REFERENCES public.lead_tasks(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela para armazenar tokens do Google Calendar por usuário
CREATE TABLE public.google_calendar_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  calendar_id text DEFAULT 'primary',
  is_sync_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.schedule_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- Índices para performance
CREATE INDEX idx_schedule_events_organization ON public.schedule_events(organization_id);
CREATE INDEX idx_schedule_events_user ON public.schedule_events(user_id);
CREATE INDEX idx_schedule_events_lead ON public.schedule_events(lead_id);
CREATE INDEX idx_schedule_events_start_at ON public.schedule_events(start_at);
CREATE INDEX idx_schedule_events_event_type ON public.schedule_events(event_type);

-- RLS: Acesso hierárquico para visualização de eventos
-- Admin: vê todos da organização
-- Líder: vê os seus + da equipe que lidera
-- Usuário: vê apenas os seus
CREATE POLICY "Hierarchical schedule event access"
ON public.schedule_events FOR SELECT
USING (
  organization_id = get_user_organization_id()
  AND (
    is_admin()
    OR (is_team_leader() AND user_id IN (
      SELECT tm.user_id FROM public.team_members tm
      WHERE tm.team_id IN (SELECT get_user_led_team_ids())
    ))
    OR user_id = auth.uid()
  )
);

-- RLS: Usuários podem criar eventos na sua organização
CREATE POLICY "Users can create schedule events"
ON public.schedule_events FOR INSERT
WITH CHECK (
  organization_id = get_user_organization_id()
  AND (user_id = auth.uid() OR is_admin())
);

-- RLS: Usuários podem atualizar seus próprios eventos, admins podem atualizar qualquer um
CREATE POLICY "Users can update own schedule events"
ON public.schedule_events FOR UPDATE
USING (
  organization_id = get_user_organization_id()
  AND (user_id = auth.uid() OR is_admin())
);

-- RLS: Usuários podem deletar seus próprios eventos, admins podem deletar qualquer um
CREATE POLICY "Users can delete own schedule events"
ON public.schedule_events FOR DELETE
USING (
  organization_id = get_user_organization_id()
  AND (user_id = auth.uid() OR is_admin())
);

-- RLS: Cada usuário gerencia apenas seus tokens do Google
CREATE POLICY "Users manage own google tokens"
ON public.google_calendar_tokens FOR ALL
USING (user_id = auth.uid());

-- Trigger para atualizar updated_at
CREATE TRIGGER update_schedule_events_updated_at
BEFORE UPDATE ON public.schedule_events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_google_calendar_tokens_updated_at
BEFORE UPDATE ON public.google_calendar_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();