-- Tabela de sessões/instâncias WhatsApp
CREATE TABLE public.whatsapp_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL,
  instance_id TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  phone_number TEXT,
  profile_name TEXT,
  profile_picture TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de controle de acesso às sessões
CREATE TABLE public.whatsapp_session_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  can_view BOOLEAN DEFAULT true,
  can_send BOOLEAN DEFAULT true,
  granted_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(session_id, user_id)
);

-- Tabela de conversas
CREATE TABLE public.whatsapp_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  remote_jid TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  contact_picture TEXT,
  last_message TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE,
  unread_count INTEGER DEFAULT 0,
  is_group BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(session_id, remote_jid)
);

-- Tabela de mensagens
CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  from_me BOOLEAN NOT NULL DEFAULT false,
  content TEXT,
  message_type TEXT DEFAULT 'text',
  media_url TEXT,
  media_mime_type TEXT,
  status TEXT DEFAULT 'sent',
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(session_id, message_id)
);

-- Índices para performance
CREATE INDEX idx_whatsapp_sessions_org ON public.whatsapp_sessions(organization_id);
CREATE INDEX idx_whatsapp_sessions_owner ON public.whatsapp_sessions(owner_user_id);
CREATE INDEX idx_whatsapp_conversations_session ON public.whatsapp_conversations(session_id);
CREATE INDEX idx_whatsapp_conversations_lead ON public.whatsapp_conversations(lead_id);
CREATE INDEX idx_whatsapp_messages_conversation ON public.whatsapp_messages(conversation_id);
CREATE INDEX idx_whatsapp_messages_sent_at ON public.whatsapp_messages(sent_at DESC);

-- Triggers para updated_at
CREATE TRIGGER update_whatsapp_sessions_updated_at
BEFORE UPDATE ON public.whatsapp_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_whatsapp_conversations_updated_at
BEFORE UPDATE ON public.whatsapp_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_session_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies para whatsapp_sessions
CREATE POLICY "Users can view sessions they own or have access to"
ON public.whatsapp_sessions
FOR SELECT
USING (
  organization_id = get_user_organization_id() AND (
    owner_user_id = auth.uid() OR
    is_admin() OR
    id IN (SELECT session_id FROM public.whatsapp_session_access WHERE user_id = auth.uid() AND can_view = true)
  )
);

CREATE POLICY "Users can create sessions in their org"
ON public.whatsapp_sessions
FOR INSERT
WITH CHECK (organization_id = get_user_organization_id() AND owner_user_id = auth.uid());

CREATE POLICY "Session owners and admins can update"
ON public.whatsapp_sessions
FOR UPDATE
USING (organization_id = get_user_organization_id() AND (owner_user_id = auth.uid() OR is_admin()));

CREATE POLICY "Session owners and admins can delete"
ON public.whatsapp_sessions
FOR DELETE
USING (organization_id = get_user_organization_id() AND (owner_user_id = auth.uid() OR is_admin()));

-- RLS Policies para whatsapp_session_access
CREATE POLICY "Users can view access grants for accessible sessions"
ON public.whatsapp_session_access
FOR SELECT
USING (
  session_id IN (
    SELECT id FROM public.whatsapp_sessions 
    WHERE organization_id = get_user_organization_id()
  )
);

CREATE POLICY "Session owners and admins can manage access"
ON public.whatsapp_session_access
FOR ALL
USING (
  session_id IN (
    SELECT id FROM public.whatsapp_sessions 
    WHERE organization_id = get_user_organization_id() AND (owner_user_id = auth.uid() OR is_admin())
  )
);

-- RLS Policies para whatsapp_conversations
CREATE POLICY "Users can view conversations from accessible sessions"
ON public.whatsapp_conversations
FOR SELECT
USING (
  session_id IN (
    SELECT id FROM public.whatsapp_sessions 
    WHERE organization_id = get_user_organization_id() AND (
      owner_user_id = auth.uid() OR
      is_admin() OR
      id IN (SELECT session_id FROM public.whatsapp_session_access WHERE user_id = auth.uid() AND can_view = true)
    )
  )
);

CREATE POLICY "System can manage conversations"
ON public.whatsapp_conversations
FOR ALL
USING (
  session_id IN (
    SELECT id FROM public.whatsapp_sessions 
    WHERE organization_id = get_user_organization_id()
  )
);

-- RLS Policies para whatsapp_messages
CREATE POLICY "Users can view messages from accessible sessions"
ON public.whatsapp_messages
FOR SELECT
USING (
  session_id IN (
    SELECT id FROM public.whatsapp_sessions 
    WHERE organization_id = get_user_organization_id() AND (
      owner_user_id = auth.uid() OR
      is_admin() OR
      id IN (SELECT session_id FROM public.whatsapp_session_access WHERE user_id = auth.uid() AND can_view = true)
    )
  )
);

CREATE POLICY "Users can send messages to accessible sessions"
ON public.whatsapp_messages
FOR INSERT
WITH CHECK (
  session_id IN (
    SELECT id FROM public.whatsapp_sessions 
    WHERE organization_id = get_user_organization_id() AND (
      owner_user_id = auth.uid() OR
      is_admin() OR
      id IN (SELECT session_id FROM public.whatsapp_session_access WHERE user_id = auth.uid() AND can_send = true)
    )
  )
);

CREATE POLICY "System can update message status"
ON public.whatsapp_messages
FOR UPDATE
USING (
  session_id IN (
    SELECT id FROM public.whatsapp_sessions 
    WHERE organization_id = get_user_organization_id()
  )
);

-- Habilitar realtime para mensagens
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;