-- ============================================
-- SCHEMA CONSOLIDADO - VIMOB CRM
-- Gerado em: 2026-01-09
-- ============================================
-- Execute este arquivo no SQL Editor do Supabase
-- na ordem apresentada (de cima para baixo)
-- ============================================

-- ============================================
-- 1. EXTENSÕES NECESSÁRIAS
-- ============================================

-- A extensão pgcrypto geralmente já está habilitada no Supabase
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 2. ENUMS (TIPOS CUSTOMIZADOS)
-- ============================================

-- Roles de usuário
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Fontes de leads
CREATE TYPE public.lead_source AS ENUM ('meta', 'site', 'manual', 'wordpress', 'whatsapp');

-- Tipos de tarefas
CREATE TYPE public.task_type AS ENUM ('call', 'message', 'email', 'note');

-- Estratégias de round robin
CREATE TYPE public.round_robin_strategy AS ENUM ('simple', 'weighted');

-- ============================================
-- 3. FUNÇÕES AUXILIARES (SECURITY DEFINER)
-- ============================================

-- Função para obter organization_id do usuário atual
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid()
$$;

-- Função para verificar se usuário tem uma role específica
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Função para verificar se usuário é admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  )
$$;

-- Função para verificar se usuário tem organização
CREATE OR REPLACE FUNCTION public.user_has_organization()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND organization_id IS NOT NULL
  )
$$;

-- Função para verificar se usuário é líder de equipe
CREATE OR REPLACE FUNCTION public.is_team_leader()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = auth.uid() AND is_leader = true
  )
$$;

-- Função para obter IDs das equipes do usuário
CREATE OR REPLACE FUNCTION public.get_user_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
$$;

-- Função para obter IDs das equipes lideradas pelo usuário
CREATE OR REPLACE FUNCTION public.get_user_led_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id FROM public.team_members WHERE user_id = auth.uid() AND is_leader = true
$$;

-- Função trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================
-- 4. TABELAS PRINCIPAIS
-- ============================================

-- 4.1 Organizações (Tenants)
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  logo_size integer DEFAULT 32,
  accent_color text DEFAULT '#0891b2',
  segment text DEFAULT 'imobiliário',
  theme_mode text DEFAULT 'light',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4.2 Usuários (Perfis)
CREATE TABLE public.users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  avatar_url text,
  role app_role NOT NULL DEFAULT 'user',
  organization_id uuid REFERENCES public.organizations(id),
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4.3 Roles de Usuário (Separado para segurança)
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

-- 4.4 Permissões
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  description text
);

-- 4.5 Permissões de Usuário
CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE
);

-- 4.6 Equipes
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 4.7 Membros de Equipe
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  is_leader boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 4.8 Pipelines
CREATE TABLE public.pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4.9 Pipelines por Equipe
CREATE TABLE public.team_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4.10 Estágios do Pipeline
CREATE TABLE public.stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  stage_key text NOT NULL,
  color text DEFAULT '#6b7280',
  position integer NOT NULL DEFAULT 0
);

-- 4.11 Tags
CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4.12 Tipos de Imóveis
CREATE TABLE public.property_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 4.13 Sequências de Código de Imóveis
CREATE TABLE public.property_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  prefix text NOT NULL,
  last_number integer DEFAULT 0
);

-- 4.14 Imóveis
CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text,
  descricao text,
  tipo_de_imovel text,
  tipo_de_negocio text,
  status text DEFAULT 'ativo',
  destaque boolean DEFAULT false,
  
  -- Localização
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  cep text,
  
  -- Valores
  preco numeric,
  condominio numeric,
  iptu numeric,
  seguro_incendio numeric,
  taxa_de_servico numeric,
  
  -- Características
  quartos integer,
  suites integer,
  banheiros integer,
  vagas integer,
  area_util numeric,
  area_total numeric,
  andar integer,
  ano_construcao integer,
  mobilia text,
  regra_pet boolean DEFAULT false,
  
  -- Mídia
  imagem_principal text,
  fotos jsonb DEFAULT '[]'::jsonb,
  video_imovel text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4.15 Leads
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pipeline_id uuid REFERENCES public.pipelines(id),
  stage_id uuid REFERENCES public.stages(id),
  assigned_user_id uuid REFERENCES public.users(id),
  property_id uuid REFERENCES public.properties(id),
  
  name text NOT NULL,
  email text,
  phone text,
  message text,
  property_code text,
  source lead_source NOT NULL DEFAULT 'manual',
  
  stage_entered_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4.16 Tags de Leads (Relacionamento N:N)
CREATE TABLE public.lead_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  UNIQUE(lead_id, tag_id)
);

-- 4.17 Metadados de Leads (Meta Ads)
CREATE TABLE public.lead_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  campaign_id text,
  adset_id text,
  ad_id text,
  form_id text,
  page_id text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4.18 Tarefas de Leads
CREATE TABLE public.lead_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  type task_type NOT NULL DEFAULT 'call',
  day_offset integer NOT NULL DEFAULT 0,
  due_date date,
  is_done boolean DEFAULT false,
  done_at timestamptz,
  done_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4.19 Atividades
CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id),
  type text NOT NULL,
  content text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4.20 Templates de Cadência
CREATE TABLE public.cadence_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  stage_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4.21 Tarefas de Template de Cadência
CREATE TABLE public.cadence_tasks_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cadence_template_id uuid NOT NULL REFERENCES public.cadence_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  type task_type NOT NULL DEFAULT 'call',
  day_offset integer NOT NULL DEFAULT 0,
  position integer DEFAULT 0
);

-- 4.22 Round Robins
CREATE TABLE public.round_robins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  strategy round_robin_strategy NOT NULL DEFAULT 'simple',
  is_active boolean DEFAULT true,
  last_assigned_index integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4.23 Regras de Round Robin
CREATE TABLE public.round_robin_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_robin_id uuid NOT NULL REFERENCES public.round_robins(id) ON DELETE CASCADE,
  match_type text NOT NULL,
  match_value text NOT NULL
);

-- 4.24 Membros de Round Robin
CREATE TABLE public.round_robin_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_robin_id uuid NOT NULL REFERENCES public.round_robins(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id),
  weight integer DEFAULT 1,
  position integer NOT NULL DEFAULT 0
);

-- 4.25 Log de Atribuições
CREATE TABLE public.assignments_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  assigned_user_id uuid REFERENCES public.users(id),
  round_robin_id uuid REFERENCES public.round_robins(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4.26 Notificações
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id),
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  content text,
  is_read boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4.27 Convites
CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text,
  role app_role DEFAULT 'user',
  token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  created_by uuid REFERENCES public.users(id),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 4.28 Integrações Meta (Facebook Ads)
CREATE TABLE public.meta_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  access_token text,
  page_id text,
  page_name text,
  form_ids jsonb DEFAULT '[]'::jsonb,
  field_mapping jsonb DEFAULT '{}'::jsonb,
  campaign_property_mapping jsonb DEFAULT '[]'::jsonb,
  is_connected boolean DEFAULT false,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4.29 Integrações WordPress
CREATE TABLE public.wordpress_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  is_active boolean DEFAULT true,
  leads_received integer DEFAULT 0,
  last_lead_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4.30 Sessões WhatsApp
CREATE TABLE public.whatsapp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES public.users(id),
  instance_name text NOT NULL,
  instance_id text,
  status text NOT NULL DEFAULT 'disconnected',
  phone_number text,
  profile_name text,
  profile_picture text,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4.31 Acesso a Sessões WhatsApp
CREATE TABLE public.whatsapp_session_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  can_view boolean DEFAULT true,
  can_send boolean DEFAULT true,
  granted_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, user_id)
);

-- 4.32 Conversas WhatsApp
CREATE TABLE public.whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id),
  remote_jid text NOT NULL,
  contact_name text,
  contact_phone text,
  contact_picture text,
  is_group boolean DEFAULT false,
  last_message text,
  last_message_at timestamptz,
  unread_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, remote_jid)
);

-- 4.33 Mensagens WhatsApp
CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  message_id text NOT NULL,
  content text,
  message_type text DEFAULT 'text',
  from_me boolean NOT NULL DEFAULT false,
  status text DEFAULT 'sent',
  media_url text,
  media_mime_type text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  read_at timestamptz,
  UNIQUE(conversation_id, message_id)
);

-- ============================================
-- 5. ÍNDICES PARA PERFORMANCE
-- ============================================

CREATE INDEX idx_users_organization ON public.users(organization_id);
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_leads_organization ON public.leads(organization_id);
CREATE INDEX idx_leads_pipeline ON public.leads(pipeline_id);
CREATE INDEX idx_leads_stage ON public.leads(stage_id);
CREATE INDEX idx_leads_assigned_user ON public.leads(assigned_user_id);
CREATE INDEX idx_leads_phone ON public.leads(phone);
CREATE INDEX idx_leads_email ON public.leads(email);
CREATE INDEX idx_activities_lead ON public.activities(lead_id);
CREATE INDEX idx_lead_tasks_lead ON public.lead_tasks(lead_id);
CREATE INDEX idx_lead_tasks_due_date ON public.lead_tasks(due_date);
CREATE INDEX idx_stages_pipeline ON public.stages(pipeline_id);
CREATE INDEX idx_team_members_team ON public.team_members(team_id);
CREATE INDEX idx_team_members_user ON public.team_members(user_id);
CREATE INDEX idx_properties_organization ON public.properties(organization_id);
CREATE INDEX idx_properties_code ON public.properties(code);
CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_whatsapp_sessions_organization ON public.whatsapp_sessions(organization_id);
CREATE INDEX idx_whatsapp_conversations_session ON public.whatsapp_conversations(session_id);
CREATE INDEX idx_whatsapp_conversations_lead ON public.whatsapp_conversations(lead_id);
CREATE INDEX idx_whatsapp_messages_conversation ON public.whatsapp_messages(conversation_id);

-- ============================================
-- 6. TRIGGERS
-- ============================================

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_meta_integrations_updated_at
  BEFORE UPDATE ON public.meta_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wordpress_integrations_updated_at
  BEFORE UPDATE ON public.wordpress_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_whatsapp_sessions_updated_at
  BEFORE UPDATE ON public.whatsapp_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_whatsapp_conversations_updated_at
  BEFORE UPDATE ON public.whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 7. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_tasks_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_robins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_robin_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_robin_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wordpress_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_session_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 7.1 Políticas: Organizations
-- ============================================

CREATE POLICY "Users can view their organization"
  ON public.organizations FOR SELECT
  USING (id = get_user_organization_id());

CREATE POLICY "New users can create organization during onboarding"
  ON public.organizations FOR INSERT
  WITH CHECK (NOT user_has_organization());

CREATE POLICY "Admins can update their organization"
  ON public.organizations FOR UPDATE
  USING (id = get_user_organization_id() AND is_admin());

-- ============================================
-- 7.2 Políticas: Users
-- ============================================

CREATE POLICY "Users can view organization members"
  ON public.users FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Users can insert their profile"
  ON public.users FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (id = auth.uid());

-- ============================================
-- 7.3 Políticas: User Roles
-- ============================================

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (is_admin());

CREATE POLICY "Users can create their first role during onboarding"
  ON public.user_roles FOR INSERT
  WITH CHECK (
    user_id = auth.uid() 
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_roles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view roles in org"
  ON public.user_roles FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM public.users 
      WHERE organization_id = get_user_organization_id()
    )
  );

-- ============================================
-- 7.4 Políticas: Permissions
-- ============================================

CREATE POLICY "Anyone can read permissions"
  ON public.permissions FOR SELECT
  USING (true);

-- ============================================
-- 7.5 Políticas: User Permissions
-- ============================================

CREATE POLICY "Admins can manage user permissions"
  ON public.user_permissions FOR ALL
  USING (is_admin());

CREATE POLICY "Users can view permissions in org"
  ON public.user_permissions FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM public.users 
      WHERE organization_id = get_user_organization_id()
    )
  );

-- ============================================
-- 7.6 Políticas: Teams
-- ============================================

CREATE POLICY "Users can view org teams"
  ON public.teams FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Admins can manage teams"
  ON public.teams FOR ALL
  USING (organization_id = get_user_organization_id() AND is_admin());

-- ============================================
-- 7.7 Políticas: Team Members
-- ============================================

CREATE POLICY "Users can view team members"
  ON public.team_members FOR SELECT
  USING (
    team_id IN (
      SELECT id FROM public.teams 
      WHERE organization_id = get_user_organization_id()
    )
  );

CREATE POLICY "Admins can manage team members"
  ON public.team_members FOR ALL
  USING (
    team_id IN (
      SELECT id FROM public.teams 
      WHERE organization_id = get_user_organization_id()
    ) AND is_admin()
  );

-- ============================================
-- 7.8 Políticas: Pipelines
-- ============================================

CREATE POLICY "Hierarchical pipeline access"
  ON public.pipelines FOR SELECT
  USING (
    organization_id = get_user_organization_id() 
    AND (
      is_admin()
      OR id IN (
        SELECT pipeline_id FROM public.team_pipelines 
        WHERE team_id IN (SELECT get_user_team_ids())
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.team_pipelines tp
        JOIN public.teams t ON tp.team_id = t.id
        WHERE t.organization_id = get_user_organization_id()
      )
    )
  );

CREATE POLICY "Admins can manage pipelines"
  ON public.pipelines FOR ALL
  USING (organization_id = get_user_organization_id() AND is_admin());

-- ============================================
-- 7.9 Políticas: Team Pipelines
-- ============================================

CREATE POLICY "Users can view team pipelines in their org"
  ON public.team_pipelines FOR SELECT
  USING (
    team_id IN (
      SELECT id FROM public.teams 
      WHERE organization_id = get_user_organization_id()
    )
  );

CREATE POLICY "Admins can manage team pipelines"
  ON public.team_pipelines FOR ALL
  USING (
    team_id IN (
      SELECT id FROM public.teams 
      WHERE organization_id = get_user_organization_id()
    ) AND is_admin()
  );

-- ============================================
-- 7.10 Políticas: Stages
-- ============================================

CREATE POLICY "Users can view stages"
  ON public.stages FOR SELECT
  USING (
    pipeline_id IN (
      SELECT id FROM public.pipelines 
      WHERE organization_id = get_user_organization_id()
    )
  );

CREATE POLICY "Admins can manage stages"
  ON public.stages FOR ALL
  USING (
    pipeline_id IN (
      SELECT id FROM public.pipelines 
      WHERE organization_id = get_user_organization_id()
    ) AND is_admin()
  );

-- ============================================
-- 7.11 Políticas: Tags
-- ============================================

CREATE POLICY "Users can view org tags"
  ON public.tags FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Users can manage tags"
  ON public.tags FOR ALL
  USING (organization_id = get_user_organization_id());

-- ============================================
-- 7.12 Políticas: Property Types
-- ============================================

CREATE POLICY "Users can view property types"
  ON public.property_types FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Users can manage property types"
  ON public.property_types FOR ALL
  USING (organization_id = get_user_organization_id());

-- ============================================
-- 7.13 Políticas: Property Sequences
-- ============================================

CREATE POLICY "Users can view property sequences"
  ON public.property_sequences FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Users can manage property sequences"
  ON public.property_sequences FOR ALL
  USING (organization_id = get_user_organization_id());

-- ============================================
-- 7.14 Políticas: Properties
-- ============================================

CREATE POLICY "Users can view org properties"
  ON public.properties FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Users can manage properties"
  ON public.properties FOR ALL
  USING (organization_id = get_user_organization_id());

-- ============================================
-- 7.15 Políticas: Leads
-- ============================================

CREATE POLICY "Hierarchical lead access"
  ON public.leads FOR SELECT
  USING (
    organization_id = get_user_organization_id()
    AND (
      is_admin()
      OR (is_team_leader() AND pipeline_id IN (
        SELECT pipeline_id FROM public.team_pipelines 
        WHERE team_id IN (SELECT get_user_led_team_ids())
      ))
      OR assigned_user_id = auth.uid()
      OR NOT EXISTS (
        SELECT 1 FROM public.team_pipelines 
        WHERE pipeline_id = leads.pipeline_id
      )
    )
  );

CREATE POLICY "Hierarchical lead management"
  ON public.leads FOR ALL
  USING (
    organization_id = get_user_organization_id()
    AND (
      is_admin()
      OR (is_team_leader() AND pipeline_id IN (
        SELECT pipeline_id FROM public.team_pipelines 
        WHERE team_id IN (SELECT get_user_led_team_ids())
      ))
      OR assigned_user_id = auth.uid()
      OR NOT EXISTS (
        SELECT 1 FROM public.team_pipelines 
        WHERE pipeline_id = leads.pipeline_id
      )
    )
  );

-- ============================================
-- 7.16 Políticas: Lead Tags
-- ============================================

CREATE POLICY "Users can view lead tags"
  ON public.lead_tags FOR SELECT
  USING (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = get_user_organization_id()
    )
  );

CREATE POLICY "Users can manage lead tags"
  ON public.lead_tags FOR ALL
  USING (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = get_user_organization_id()
    )
  );

-- ============================================
-- 7.17 Políticas: Lead Meta
-- ============================================

CREATE POLICY "Users can view lead meta"
  ON public.lead_meta FOR SELECT
  USING (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = get_user_organization_id()
    )
  );

CREATE POLICY "Users can manage lead meta"
  ON public.lead_meta FOR ALL
  USING (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = get_user_organization_id()
    )
  );

-- ============================================
-- 7.18 Políticas: Lead Tasks
-- ============================================

CREATE POLICY "Users can view lead tasks"
  ON public.lead_tasks FOR SELECT
  USING (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = get_user_organization_id()
    )
  );

CREATE POLICY "Users can manage lead tasks"
  ON public.lead_tasks FOR ALL
  USING (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = get_user_organization_id()
    )
  );

-- ============================================
-- 7.19 Políticas: Activities
-- ============================================

CREATE POLICY "Users can view org activities"
  ON public.activities FOR SELECT
  USING (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = get_user_organization_id()
    )
  );

CREATE POLICY "Users can create activities"
  ON public.activities FOR INSERT
  WITH CHECK (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = get_user_organization_id()
    )
  );

-- ============================================
-- 7.20 Políticas: Cadence Templates
-- ============================================

CREATE POLICY "Users can view cadence templates"
  ON public.cadence_templates FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Admins can manage cadence templates"
  ON public.cadence_templates FOR ALL
  USING (organization_id = get_user_organization_id() AND is_admin());

-- ============================================
-- 7.21 Políticas: Cadence Tasks Template
-- ============================================

CREATE POLICY "Users can view cadence task templates"
  ON public.cadence_tasks_template FOR SELECT
  USING (
    cadence_template_id IN (
      SELECT id FROM public.cadence_templates 
      WHERE organization_id = get_user_organization_id()
    )
  );

CREATE POLICY "Admins can manage cadence task templates"
  ON public.cadence_tasks_template FOR ALL
  USING (
    cadence_template_id IN (
      SELECT id FROM public.cadence_templates 
      WHERE organization_id = get_user_organization_id()
    ) AND is_admin()
  );

-- ============================================
-- 7.22 Políticas: Round Robins
-- ============================================

CREATE POLICY "Users can view round robins"
  ON public.round_robins FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Admins can manage round robins"
  ON public.round_robins FOR ALL
  USING (organization_id = get_user_organization_id() AND is_admin());

-- ============================================
-- 7.23 Políticas: Round Robin Rules
-- ============================================

CREATE POLICY "Users can view round robin rules"
  ON public.round_robin_rules FOR SELECT
  USING (
    round_robin_id IN (
      SELECT id FROM public.round_robins 
      WHERE organization_id = get_user_organization_id()
    )
  );

CREATE POLICY "Admins can manage round robin rules"
  ON public.round_robin_rules FOR ALL
  USING (
    round_robin_id IN (
      SELECT id FROM public.round_robins 
      WHERE organization_id = get_user_organization_id()
    ) AND is_admin()
  );

-- ============================================
-- 7.24 Políticas: Round Robin Members
-- ============================================

CREATE POLICY "Users can view round robin members"
  ON public.round_robin_members FOR SELECT
  USING (
    round_robin_id IN (
      SELECT id FROM public.round_robins 
      WHERE organization_id = get_user_organization_id()
    )
  );

CREATE POLICY "Admins can manage round robin members"
  ON public.round_robin_members FOR ALL
  USING (
    round_robin_id IN (
      SELECT id FROM public.round_robins 
      WHERE organization_id = get_user_organization_id()
    ) AND is_admin()
  );

-- ============================================
-- 7.25 Políticas: Assignments Log
-- ============================================

CREATE POLICY "Users can view assignments log"
  ON public.assignments_log FOR SELECT
  USING (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = get_user_organization_id()
    )
  );

CREATE POLICY "System can create assignments"
  ON public.assignments_log FOR INSERT
  WITH CHECK (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = get_user_organization_id()
    )
  );

-- ============================================
-- 7.26 Políticas: Notifications
-- ============================================

CREATE POLICY "Users can view their notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid() OR organization_id = get_user_organization_id());

CREATE POLICY "System can create notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Users can update their notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their notifications"
  ON public.notifications FOR DELETE
  USING (user_id = auth.uid());

-- ============================================
-- 7.27 Políticas: Invitations
-- ============================================

CREATE POLICY "Anyone can view invitation by token"
  ON public.invitations FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage invitations"
  ON public.invitations FOR ALL
  USING (organization_id = get_user_organization_id() AND is_admin());

-- ============================================
-- 7.28 Políticas: Meta Integrations
-- ============================================

CREATE POLICY "Users can view meta integration"
  ON public.meta_integrations FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Admins can manage meta integration"
  ON public.meta_integrations FOR ALL
  USING (organization_id = get_user_organization_id() AND is_admin());

-- ============================================
-- 7.29 Políticas: WordPress Integrations
-- ============================================

CREATE POLICY "Users can view wordpress integration"
  ON public.wordpress_integrations FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Admins can manage wordpress integration"
  ON public.wordpress_integrations FOR ALL
  USING (organization_id = get_user_organization_id() AND is_admin());

-- ============================================
-- 7.30 Políticas: WhatsApp Sessions
-- ============================================

CREATE POLICY "Users can view sessions they own or have access to"
  ON public.whatsapp_sessions FOR SELECT
  USING (
    organization_id = get_user_organization_id()
    AND (
      owner_user_id = auth.uid()
      OR is_admin()
      OR id IN (
        SELECT session_id FROM public.whatsapp_session_access 
        WHERE user_id = auth.uid() AND can_view = true
      )
    )
  );

CREATE POLICY "Users can create sessions in their org"
  ON public.whatsapp_sessions FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id() 
    AND owner_user_id = auth.uid()
  );

CREATE POLICY "Session owners and admins can update"
  ON public.whatsapp_sessions FOR UPDATE
  USING (
    organization_id = get_user_organization_id()
    AND (owner_user_id = auth.uid() OR is_admin())
  );

CREATE POLICY "Session owners and admins can delete"
  ON public.whatsapp_sessions FOR DELETE
  USING (
    organization_id = get_user_organization_id()
    AND (owner_user_id = auth.uid() OR is_admin())
  );

-- ============================================
-- 7.31 Políticas: WhatsApp Session Access
-- ============================================

CREATE POLICY "Users can view access grants for accessible sessions"
  ON public.whatsapp_session_access FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM public.whatsapp_sessions 
      WHERE organization_id = get_user_organization_id()
    )
  );

CREATE POLICY "Session owners and admins can manage access"
  ON public.whatsapp_session_access FOR ALL
  USING (
    session_id IN (
      SELECT id FROM public.whatsapp_sessions 
      WHERE organization_id = get_user_organization_id()
      AND (owner_user_id = auth.uid() OR is_admin())
    )
  );

-- ============================================
-- 7.32 Políticas: WhatsApp Conversations
-- ============================================

CREATE POLICY "Users can view conversations from accessible sessions"
  ON public.whatsapp_conversations FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM public.whatsapp_sessions 
      WHERE organization_id = get_user_organization_id()
      AND (
        owner_user_id = auth.uid()
        OR is_admin()
        OR id IN (
          SELECT session_id FROM public.whatsapp_session_access 
          WHERE user_id = auth.uid() AND can_view = true
        )
      )
    )
  );

CREATE POLICY "System can manage conversations"
  ON public.whatsapp_conversations FOR ALL
  USING (
    session_id IN (
      SELECT id FROM public.whatsapp_sessions 
      WHERE organization_id = get_user_organization_id()
    )
  );

-- ============================================
-- 7.33 Políticas: WhatsApp Messages
-- ============================================

CREATE POLICY "Users can view messages from accessible sessions"
  ON public.whatsapp_messages FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM public.whatsapp_sessions 
      WHERE organization_id = get_user_organization_id()
      AND (
        owner_user_id = auth.uid()
        OR is_admin()
        OR id IN (
          SELECT session_id FROM public.whatsapp_session_access 
          WHERE user_id = auth.uid() AND can_view = true
        )
      )
    )
  );

CREATE POLICY "Users can send messages to accessible sessions"
  ON public.whatsapp_messages FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT id FROM public.whatsapp_sessions 
      WHERE organization_id = get_user_organization_id()
      AND (
        owner_user_id = auth.uid()
        OR is_admin()
        OR id IN (
          SELECT session_id FROM public.whatsapp_session_access 
          WHERE user_id = auth.uid() AND can_send = true
        )
      )
    )
  );

CREATE POLICY "System can update message status"
  ON public.whatsapp_messages FOR UPDATE
  USING (
    session_id IN (
      SELECT id FROM public.whatsapp_sessions 
      WHERE organization_id = get_user_organization_id()
    )
  );

-- ============================================
-- 8. STORAGE BUCKETS
-- ============================================

-- Criar buckets de storage
INSERT INTO storage.buckets (id, name, public) 
VALUES ('properties', 'properties', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de Storage: Properties
CREATE POLICY "Property images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'properties');

CREATE POLICY "Authenticated users can upload property images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'properties' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update property images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'properties' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete property images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'properties' AND auth.role() = 'authenticated');

-- Políticas de Storage: Logos
CREATE POLICY "Logos are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'logos');

CREATE POLICY "Authenticated users can upload logos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'logos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update logos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'logos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete logos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'logos' AND auth.role() = 'authenticated');

-- ============================================
-- 9. REALTIME
-- ============================================

-- Habilitar Realtime para mensagens WhatsApp
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;

-- ============================================
-- 10. DADOS INICIAIS
-- ============================================

-- Permissões padrão do sistema
INSERT INTO public.permissions (key, description) VALUES
  ('view_leads', 'Visualizar leads'),
  ('manage_leads', 'Gerenciar leads'),
  ('view_properties', 'Visualizar imóveis'),
  ('manage_properties', 'Gerenciar imóveis'),
  ('view_team', 'Visualizar equipe'),
  ('manage_team', 'Gerenciar equipe'),
  ('view_reports', 'Visualizar relatórios'),
  ('manage_settings', 'Gerenciar configurações'),
  ('manage_integrations', 'Gerenciar integrações')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- FIM DO SCHEMA
-- ============================================
-- Próximos passos:
-- 1. Configure os secrets no Supabase:
--    - EVOLUTION_API_URL
--    - EVOLUTION_API_KEY
-- 2. Faça deploy das Edge Functions:
--    - evolution-proxy
--    - evolution-webhook  
--    - wordpress-webhook
-- 3. Atualize as variáveis de ambiente no frontend
-- ============================================
