
-- Create ai_agents table
CREATE TABLE public.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.whatsapp_sessions(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT 'Assistente',
  is_active boolean DEFAULT true,
  ai_provider text DEFAULT 'openai',
  system_prompt text,
  handoff_keywords text[],
  max_messages_before_handoff integer DEFAULT 20,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create ai_agent_conversations table
CREATE TABLE public.ai_agent_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  status text DEFAULT 'active',
  message_count integer DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  handed_off_at timestamptz,
  UNIQUE(conversation_id)
);

-- Indexes
CREATE INDEX idx_ai_agents_organization_id ON public.ai_agents(organization_id);
CREATE INDEX idx_ai_agents_session_id ON public.ai_agents(session_id);
CREATE INDEX idx_ai_agent_conversations_agent_id ON public.ai_agent_conversations(agent_id);
CREATE INDEX idx_ai_agent_conversations_conversation_id ON public.ai_agent_conversations(conversation_id);
CREATE INDEX idx_ai_agent_conversations_status ON public.ai_agent_conversations(status);

-- Enable RLS
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_agents
CREATE POLICY "Users can view ai_agents of their organization"
  ON public.ai_agents FOR SELECT
  USING (public.user_belongs_to_organization(organization_id));

CREATE POLICY "Admins can manage ai_agents"
  ON public.ai_agents FOR ALL
  USING (public.user_belongs_to_organization(organization_id) AND public.is_admin());

-- RLS Policies for ai_agent_conversations
CREATE POLICY "Users can view ai_agent_conversations of their organization"
  ON public.ai_agent_conversations FOR SELECT
  USING (
    agent_id IN (
      SELECT id FROM public.ai_agents 
      WHERE public.user_belongs_to_organization(organization_id)
    )
  );

CREATE POLICY "Admins can manage ai_agent_conversations"
  ON public.ai_agent_conversations FOR ALL
  USING (
    agent_id IN (
      SELECT id FROM public.ai_agents 
      WHERE public.user_belongs_to_organization(organization_id) AND public.is_admin()
    )
  );

-- Updated_at trigger for ai_agents
CREATE OR REPLACE FUNCTION public.update_ai_agents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_ai_agents_updated_at
  BEFORE UPDATE ON public.ai_agents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ai_agents_updated_at();
