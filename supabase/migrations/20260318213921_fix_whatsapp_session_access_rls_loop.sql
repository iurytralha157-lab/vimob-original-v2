-- ==============================================================================
-- SCRIPT DE CORREÇÃO DEFINITIVA: RESOLUÇÃO DE LOOP INFINITO (DEPENDÊNCIA CIRCULAR)
-- ==============================================================================
-- O problema acontecia porque whatsapp_sessions consultava whatsapp_session_access, 
-- e whatsapp_session_access consultava whatsapp_sessions de volta.
-- Esse script quebra o loop usando funções "SECURITY DEFINER", que consultam 
-- de forma segura sem disparar RLS infinitamente.

-- 1. Função segura para verificar acesso de forma direta (quebra o loop)
DROP FUNCTION IF EXISTS public.check_whatsapp_session_access(uuid);
CREATE OR REPLACE FUNCTION public.check_whatsapp_session_access(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_session_access 
    WHERE session_id = p_session_id AND user_id = auth.uid() AND can_view = true
  )
$$;

-- 2. Refazendo Sessões WhatsApp usando a função segura 
DROP POLICY IF EXISTS "Users can view sessions they own or have access to" ON public.whatsapp_sessions;
CREATE POLICY "Users can view sessions they own or have access to"
ON public.whatsapp_sessions
FOR SELECT
USING (
  organization_id = get_user_organization_id() AND (
    owner_user_id = auth.uid() OR
    is_admin() OR
    public.check_whatsapp_session_access(id)
  )
);

-- 3. Refazendo Conversas WhatsApp usando a função segura
DROP POLICY IF EXISTS "Users can view conversations from accessible sessions" ON public.whatsapp_conversations;
CREATE POLICY "Users can view conversations from accessible sessions"
ON public.whatsapp_conversations
FOR SELECT
USING (
  session_id IN (
    SELECT id FROM public.whatsapp_sessions 
    WHERE organization_id = get_user_organization_id() AND (
      owner_user_id = auth.uid() OR
      is_admin() OR
      public.check_whatsapp_session_access(id)
    )
  )
);

-- 4. Refazendo Mensagens WhatsApp (Visualização e Envio) usando a função segura
DROP POLICY IF EXISTS "Users can view messages from accessible sessions" ON public.whatsapp_messages;
CREATE POLICY "Users can view messages from accessible sessions"
ON public.whatsapp_messages
FOR SELECT
USING (
  session_id IN (
    SELECT id FROM public.whatsapp_sessions 
    WHERE organization_id = get_user_organization_id() AND (
      owner_user_id = auth.uid() OR
      is_admin() OR
      public.check_whatsapp_session_access(id)
    )
  )
);

-- Função separada para checar envio
DROP FUNCTION IF EXISTS public.check_whatsapp_session_send_access(uuid);
CREATE OR REPLACE FUNCTION public.check_whatsapp_session_send_access(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_session_access 
    WHERE session_id = p_session_id AND user_id = auth.uid() AND can_send = true
  )
$$;

DROP POLICY IF EXISTS "Users can send messages to accessible sessions" ON public.whatsapp_messages;
CREATE POLICY "Users can send messages to accessible sessions"
ON public.whatsapp_messages
FOR INSERT
WITH CHECK (
  session_id IN (
    SELECT id FROM public.whatsapp_sessions 
    WHERE organization_id = get_user_organization_id() AND (
      owner_user_id = auth.uid() OR
      is_admin() OR
      public.check_whatsapp_session_send_access(id)
    )
  )
);
