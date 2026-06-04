-- =====================================================
-- FASE 1: Criar bucket whatsapp-media para armazenamento de mídia
-- =====================================================

-- Criar bucket se não existir
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media',
  'whatsapp-media',
  true,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/3gpp', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800;

-- Políticas de acesso ao bucket - remover existentes e recriar
DROP POLICY IF EXISTS "Public read access whatsapp-media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload whatsapp-media" ON storage.objects;
DROP POLICY IF EXISTS "Service role can manage whatsapp-media" ON storage.objects;

-- Acesso público para leitura (necessário para exibir mídia no chat)
CREATE POLICY "Public read access whatsapp-media" ON storage.objects 
FOR SELECT USING (bucket_id = 'whatsapp-media');

-- Usuários autenticados podem fazer upload
CREATE POLICY "Authenticated users can upload whatsapp-media" ON storage.objects 
FOR INSERT WITH CHECK (bucket_id = 'whatsapp-media' AND auth.role() = 'authenticated');

-- Usuários autenticados podem atualizar seus uploads
CREATE POLICY "Authenticated users can update whatsapp-media" ON storage.objects 
FOR UPDATE USING (bucket_id = 'whatsapp-media' AND auth.role() = 'authenticated');

-- Usuários autenticados podem deletar seus uploads
CREATE POLICY "Authenticated users can delete whatsapp-media" ON storage.objects 
FOR DELETE USING (bucket_id = 'whatsapp-media' AND auth.role() = 'authenticated');

-- =====================================================
-- FASE 2: Criar tabela media_jobs para gerenciar retry de downloads
-- =====================================================

CREATE TABLE IF NOT EXISTS public.media_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.whatsapp_messages(id) ON DELETE CASCADE,
  message_key JSONB,
  media_type TEXT NOT NULL,
  media_mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 5,
  next_retry_at TIMESTAMPTZ DEFAULT now(),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_media_jobs_status ON public.media_jobs(status);
CREATE INDEX IF NOT EXISTS idx_media_jobs_next_retry ON public.media_jobs(next_retry_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_media_jobs_message_id ON public.media_jobs(message_id);
CREATE INDEX IF NOT EXISTS idx_media_jobs_organization ON public.media_jobs(organization_id);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_media_jobs_updated_at ON public.media_jobs;
CREATE TRIGGER update_media_jobs_updated_at
  BEFORE UPDATE ON public.media_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS para media_jobs
ALTER TABLE public.media_jobs ENABLE ROW LEVEL SECURITY;

-- Política: usuários podem ver jobs da sua organização
DROP POLICY IF EXISTS "Users can view own org media_jobs" ON public.media_jobs;
CREATE POLICY "Users can view own org media_jobs" ON public.media_jobs
FOR SELECT USING (organization_id = public.get_user_organization_id());

-- Política: service role pode gerenciar todos os jobs (para edge functions)
DROP POLICY IF EXISTS "Service role can manage all media_jobs" ON public.media_jobs;
CREATE POLICY "Service role can manage all media_jobs" ON public.media_jobs
FOR ALL USING (true);

-- =====================================================
-- FASE 3: Garantir que whatsapp_messages está no realtime
-- =====================================================

-- Adicionar tabelas ao realtime se ainda não estiverem
DO $$
BEGIN
  -- Verificar e adicionar whatsapp_messages
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'whatsapp_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
  END IF;
  
  -- Verificar e adicionar whatsapp_conversations
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'whatsapp_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;
  END IF;
END $$;