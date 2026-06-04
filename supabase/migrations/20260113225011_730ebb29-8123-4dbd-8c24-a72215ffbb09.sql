-- Tabela para armazenar tokens WPPConnect por sessão
CREATE TABLE public.wpp_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índice para busca rápida
CREATE INDEX idx_wpp_tokens_session ON public.wpp_tokens(session_id);

-- RLS - apenas service role pode acessar (tokens são sensíveis)
ALTER TABLE public.wpp_tokens ENABLE ROW LEVEL SECURITY;

-- Nenhuma policy para usuários normais - apenas service role acessa