-- Adicionar coluna organization_id na tabela whatsapp_conversations
ALTER TABLE public.whatsapp_conversations 
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Preencher organization_id a partir da sessão do WhatsApp
UPDATE public.whatsapp_conversations wc
SET organization_id = ws.organization_id
FROM public.whatsapp_sessions ws
WHERE wc.session_id = ws.id
  AND wc.organization_id IS NULL;

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_org_id 
  ON public.whatsapp_conversations(organization_id);

-- Atualizar RLS para usar organization_id diretamente
DROP POLICY IF EXISTS "Users can view their organization conversations" ON public.whatsapp_conversations;
CREATE POLICY "Users can view their organization conversations"
  ON public.whatsapp_conversations FOR SELECT
  USING (
    organization_id = public.get_user_organization_id()
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Users can insert conversations for their organization" ON public.whatsapp_conversations;
CREATE POLICY "Users can insert conversations for their organization"
  ON public.whatsapp_conversations FOR INSERT
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Users can update their organization conversations" ON public.whatsapp_conversations;
CREATE POLICY "Users can update their organization conversations"
  ON public.whatsapp_conversations FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id()
    OR public.is_super_admin()
  );