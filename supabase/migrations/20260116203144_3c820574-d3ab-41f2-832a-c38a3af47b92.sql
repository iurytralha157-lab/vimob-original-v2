-- =============================================================================
-- TELEPHONY CALLS TABLE - Tabela principal de ligações 3C Plus
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.telephony_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  
  -- Identificadores externos (3C Plus)
  external_call_id TEXT,
  external_session_id TEXT,
  
  -- Dados da ligação
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  phone_from TEXT,
  phone_to TEXT,
  status TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'ringing', 'answered', 'ended', 'missed', 'busy', 'failed', 'voicemail')),
  outcome TEXT CHECK (outcome IN ('connected', 'no_answer', 'busy', 'voicemail', 'wrong_number', 'callback_requested', 'not_interested', 'interested', 'sale', 'other')),
  
  -- Timestamps
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,
  talk_time_seconds INTEGER DEFAULT 0,
  
  -- Gravação
  recording_url TEXT,
  recording_status TEXT DEFAULT 'pending' CHECK (recording_status IN ('pending', 'processing', 'ready', 'failed', 'expired', 'deleted')),
  recording_storage_path TEXT,
  recording_duration_sec INTEGER,
  recording_error TEXT,
  recording_expires_at TIMESTAMPTZ,
  
  -- Metadados
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comentários
COMMENT ON TABLE public.telephony_calls IS 'Ligações telefônicas via 3C Plus com suporte a gravações';
COMMENT ON COLUMN public.telephony_calls.recording_url IS 'URL externa da gravação (3C Plus)';
COMMENT ON COLUMN public.telephony_calls.recording_storage_path IS 'Caminho no Supabase Storage após download';
COMMENT ON COLUMN public.telephony_calls.recording_status IS 'Status: pending, processing, ready, failed, expired, deleted';

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_telephony_calls_org_id ON public.telephony_calls(organization_id);
CREATE INDEX IF NOT EXISTS idx_telephony_calls_lead_id ON public.telephony_calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_telephony_calls_user_id ON public.telephony_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_telephony_calls_initiated_at ON public.telephony_calls(initiated_at DESC);
CREATE INDEX IF NOT EXISTS idx_telephony_calls_status ON public.telephony_calls(status);
CREATE INDEX IF NOT EXISTS idx_telephony_calls_external_id ON public.telephony_calls(external_call_id);
CREATE INDEX IF NOT EXISTS idx_telephony_calls_recording_status ON public.telephony_calls(recording_status);

-- Trigger para updated_at
CREATE TRIGGER update_telephony_calls_updated_at
  BEFORE UPDATE ON public.telephony_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE public.telephony_calls ENABLE ROW LEVEL SECURITY;

-- Usuários podem ver ligações da sua organização
CREATE POLICY "Users can view telephony calls from their org"
  ON public.telephony_calls FOR SELECT
  USING (organization_id = public.get_user_organization_id());

-- Usuários podem inserir ligações na sua organização
CREATE POLICY "Users can insert telephony calls in their org"
  ON public.telephony_calls FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());

-- Usuários podem atualizar ligações da sua organização
CREATE POLICY "Users can update telephony calls in their org"
  ON public.telephony_calls FOR UPDATE
  USING (organization_id = public.get_user_organization_id());

-- Super admin pode tudo
CREATE POLICY "Super admin can manage all telephony calls"
  ON public.telephony_calls FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Policy para service role (webhooks)
CREATE POLICY "Service role can manage all telephony calls"
  ON public.telephony_calls FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- =============================================================================
-- AUDIT LOG TABLE FOR RECORDINGS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.telephony_recording_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  call_id UUID NOT NULL REFERENCES public.telephony_calls(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('play', 'download', 'delete', 'archive')),
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.telephony_recording_audit IS 'Audit log para acesso a gravações - compliance';

CREATE INDEX IF NOT EXISTS idx_recording_audit_call_id ON public.telephony_recording_audit(call_id);
CREATE INDEX IF NOT EXISTS idx_recording_audit_user_id ON public.telephony_recording_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_recording_audit_created_at ON public.telephony_recording_audit(created_at DESC);

ALTER TABLE public.telephony_recording_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view recording audit from their org"
  ON public.telephony_recording_audit FOR SELECT
  USING (organization_id = public.get_user_organization_id() AND public.is_admin());

CREATE POLICY "System can insert recording audit"
  ON public.telephony_recording_audit FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id() OR 
              current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- =============================================================================
-- TRIGGERS PARA TIMELINE EVENTS
-- =============================================================================

-- Função para criar evento de ligação na timeline do lead
CREATE OR REPLACE FUNCTION public.log_call_to_timeline()
RETURNS TRIGGER AS $$
BEGIN
  -- Só loga se tiver lead_id
  IF NEW.lead_id IS NOT NULL THEN
    -- Evento de ligação iniciada
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.lead_timeline_events (
        organization_id,
        lead_id,
        event_type,
        event_at,
        actor_user_id,
        channel,
        metadata
      ) VALUES (
        NEW.organization_id,
        NEW.lead_id,
        'call_initiated',
        NEW.initiated_at,
        NEW.user_id,
        'phone',
        jsonb_build_object(
          'call_id', NEW.id,
          'direction', NEW.direction,
          'phone_to', NEW.phone_to,
          'status', NEW.status
        )
      );
    END IF;
    
    -- Evento de ligação atendida
    IF TG_OP = 'UPDATE' AND NEW.status = 'answered' AND OLD.status != 'answered' THEN
      INSERT INTO public.lead_timeline_events (
        organization_id,
        lead_id,
        event_type,
        event_at,
        actor_user_id,
        channel,
        metadata
      ) VALUES (
        NEW.organization_id,
        NEW.lead_id,
        'call_answered',
        COALESCE(NEW.answered_at, now()),
        NEW.user_id,
        'phone',
        jsonb_build_object(
          'call_id', NEW.id,
          'direction', NEW.direction
        )
      );
    END IF;
    
    -- Evento de ligação encerrada
    IF TG_OP = 'UPDATE' AND NEW.status = 'ended' AND OLD.status != 'ended' THEN
      INSERT INTO public.lead_timeline_events (
        organization_id,
        lead_id,
        event_type,
        event_at,
        actor_user_id,
        channel,
        metadata
      ) VALUES (
        NEW.organization_id,
        NEW.lead_id,
        'call_ended',
        COALESCE(NEW.ended_at, now()),
        NEW.user_id,
        'phone',
        jsonb_build_object(
          'call_id', NEW.id,
          'duration_seconds', NEW.duration_seconds,
          'talk_time_seconds', NEW.talk_time_seconds,
          'outcome', NEW.outcome,
          'has_recording', NEW.recording_url IS NOT NULL
        )
      );
    END IF;
    
    -- Evento de gravação disponível
    IF TG_OP = 'UPDATE' AND NEW.recording_status = 'ready' AND OLD.recording_status != 'ready' THEN
      INSERT INTO public.lead_timeline_events (
        organization_id,
        lead_id,
        event_type,
        event_at,
        actor_user_id,
        channel,
        metadata
      ) VALUES (
        NEW.organization_id,
        NEW.lead_id,
        'recording_ready',
        now(),
        NULL,
        'phone',
        jsonb_build_object(
          'call_id', NEW.id,
          'recording_duration_sec', NEW.recording_duration_sec
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger para INSERT
CREATE TRIGGER trg_log_call_initiated
  AFTER INSERT ON public.telephony_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.log_call_to_timeline();

-- Trigger para UPDATE
CREATE TRIGGER trg_log_call_updated
  AFTER UPDATE ON public.telephony_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.log_call_to_timeline();

-- =============================================================================
-- STORAGE BUCKET PARA GRAVAÇÕES
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('telephony-recordings', 'telephony-recordings', false)
ON CONFLICT (id) DO NOTHING;

-- Policies para o bucket de gravações (privado, via signed URL)
CREATE POLICY "Admins can read recordings from their org"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'telephony-recordings' 
    AND public.is_admin()
    AND (storage.foldername(name))[1] = 'orgs'
    AND (storage.foldername(name))[2] = public.get_user_organization_id()::text
  );

CREATE POLICY "Service role can manage recordings"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'telephony-recordings'
    AND current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- =============================================================================
-- REALTIME (opcional)
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.telephony_calls;