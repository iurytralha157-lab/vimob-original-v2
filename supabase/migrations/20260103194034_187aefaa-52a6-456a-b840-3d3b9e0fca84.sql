-- Enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Enum for lead sources
CREATE TYPE public.lead_source AS ENUM ('meta', 'site', 'manual');

-- Enum for task types
CREATE TYPE public.task_type AS ENUM ('call', 'message', 'email', 'note');

-- Enum for round robin strategy
CREATE TYPE public.round_robin_strategy AS ENUM ('simple', 'weighted');

-- Organizations (tenants)
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  segment TEXT DEFAULT 'imobiliário',
  logo_url TEXT,
  theme_mode TEXT DEFAULT 'light' CHECK (theme_mode IN ('light', 'dark')),
  accent_color TEXT DEFAULT '#0891b2',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users table (profiles)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table for RBAC (separate from profiles)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Permissions
CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  description TEXT
);

-- User permissions
CREATE TABLE public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  permission_key TEXT REFERENCES public.permissions(key) ON DELETE CASCADE NOT NULL,
  UNIQUE (user_id, permission_key)
);

-- Pipelines
CREATE TABLE public.pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pipeline stages
CREATE TABLE public.stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID REFERENCES public.pipelines(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  stage_key TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  color TEXT DEFAULT '#6b7280'
);

-- Tags
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Properties (imóveis)
CREATE TABLE public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  code TEXT NOT NULL,
  title TEXT,
  preco DECIMAL(12,2),
  destaque BOOLEAN DEFAULT false,
  condominio DECIMAL(10,2),
  iptu DECIMAL(10,2),
  seguro_incendio DECIMAL(10,2),
  taxa_de_servico DECIMAL(10,2),
  video_imovel TEXT,
  cidade TEXT,
  bairro TEXT,
  endereco TEXT,
  banheiros INTEGER,
  suites INTEGER,
  quartos INTEGER,
  vagas INTEGER,
  area_util DECIMAL(10,2),
  regra_pet BOOLEAN DEFAULT false,
  mobilia TEXT,
  tipo_de_imovel TEXT,
  tipo_de_negocio TEXT,
  descricao TEXT,
  fotos JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, code)
);

-- Leads
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  source lead_source NOT NULL DEFAULT 'manual',
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  message TEXT,
  assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  pipeline_id UUID REFERENCES public.pipelines(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES public.stages(id) ON DELETE SET NULL,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  property_code TEXT,
  stage_entered_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lead meta (from Meta/Facebook)
CREATE TABLE public.lead_meta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  page_id TEXT,
  form_id TEXT,
  ad_id TEXT,
  adset_id TEXT,
  campaign_id TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lead tags junction
CREATE TABLE public.lead_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  tag_id UUID REFERENCES public.tags(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(lead_id, tag_id)
);

-- Activities (histórico)
CREATE TABLE public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cadence templates (por estágio)
CREATE TABLE public.cadence_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  stage_key TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cadence task templates
CREATE TABLE public.cadence_tasks_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cadence_template_id UUID REFERENCES public.cadence_templates(id) ON DELETE CASCADE NOT NULL,
  day_offset INTEGER NOT NULL DEFAULT 0,
  type task_type NOT NULL DEFAULT 'call',
  title TEXT NOT NULL,
  description TEXT,
  position INTEGER DEFAULT 0
);

-- Lead tasks (instâncias)
CREATE TABLE public.lead_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  day_offset INTEGER NOT NULL DEFAULT 0,
  due_date DATE,
  type task_type NOT NULL DEFAULT 'call',
  title TEXT NOT NULL,
  description TEXT,
  is_done BOOLEAN DEFAULT false,
  done_at TIMESTAMPTZ,
  done_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Round robin configurations
CREATE TABLE public.round_robins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  strategy round_robin_strategy NOT NULL DEFAULT 'simple',
  is_active BOOLEAN DEFAULT true,
  last_assigned_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Round robin rules
CREATE TABLE public.round_robin_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_robin_id UUID REFERENCES public.round_robins(id) ON DELETE CASCADE NOT NULL,
  match_type TEXT NOT NULL,
  match_value TEXT NOT NULL
);

-- Round robin members
CREATE TABLE public.round_robin_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_robin_id UUID REFERENCES public.round_robins(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  weight INTEGER DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0
);

-- Assignment logs
CREATE TABLE public.assignments_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  round_robin_id UUID REFERENCES public.round_robins(id) ON DELETE SET NULL,
  assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Meta integration config
CREATE TABLE public.meta_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL UNIQUE,
  access_token TEXT,
  page_id TEXT,
  page_name TEXT,
  form_ids JSONB DEFAULT '[]'::jsonb,
  field_mapping JSONB DEFAULT '{}'::jsonb,
  campaign_property_mapping JSONB DEFAULT '[]'::jsonb,
  is_connected BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Property code sequence
CREATE TABLE public.property_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  prefix TEXT NOT NULL,
  last_number INTEGER DEFAULT 0,
  UNIQUE(organization_id, prefix)
);

-- Enable RLS on all tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_tasks_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_robins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_robin_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_robin_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_sequences ENABLE ROW LEVEL SECURITY;

-- Function to get user's organization
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid()
$$;

-- Function to check user role
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

-- Function to check if user is admin
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

-- RLS Policies

-- Organizations: users can only see their own org
CREATE POLICY "Users can view their organization"
  ON public.organizations FOR SELECT
  USING (id = public.get_user_organization_id());

CREATE POLICY "Admins can update their organization"
  ON public.organizations FOR UPDATE
  USING (id = public.get_user_organization_id() AND public.is_admin());

-- Users: see users in same org
CREATE POLICY "Users can view organization members"
  ON public.users FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Users can insert their profile"
  ON public.users FOR INSERT
  WITH CHECK (id = auth.uid());

-- User roles: view in same org
CREATE POLICY "Users can view roles in org"
  ON public.user_roles FOR SELECT
  USING (user_id IN (SELECT id FROM public.users WHERE organization_id = public.get_user_organization_id()));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.is_admin());

-- Permissions: all can read
CREATE POLICY "Anyone can read permissions"
  ON public.permissions FOR SELECT
  USING (true);

-- User permissions
CREATE POLICY "Users can view permissions in org"
  ON public.user_permissions FOR SELECT
  USING (user_id IN (SELECT id FROM public.users WHERE organization_id = public.get_user_organization_id()));

CREATE POLICY "Admins can manage user permissions"
  ON public.user_permissions FOR ALL
  USING (public.is_admin());

-- Pipelines
CREATE POLICY "Users can view org pipelines"
  ON public.pipelines FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Admins can manage pipelines"
  ON public.pipelines FOR ALL
  USING (organization_id = public.get_user_organization_id() AND public.is_admin());

-- Stages
CREATE POLICY "Users can view stages"
  ON public.stages FOR SELECT
  USING (pipeline_id IN (SELECT id FROM public.pipelines WHERE organization_id = public.get_user_organization_id()));

CREATE POLICY "Admins can manage stages"
  ON public.stages FOR ALL
  USING (pipeline_id IN (SELECT id FROM public.pipelines WHERE organization_id = public.get_user_organization_id()) AND public.is_admin());

-- Tags
CREATE POLICY "Users can view org tags"
  ON public.tags FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can manage tags"
  ON public.tags FOR ALL
  USING (organization_id = public.get_user_organization_id());

-- Properties
CREATE POLICY "Users can view org properties"
  ON public.properties FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can manage properties"
  ON public.properties FOR ALL
  USING (organization_id = public.get_user_organization_id());

-- Leads
CREATE POLICY "Users can view org leads"
  ON public.leads FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can manage org leads"
  ON public.leads FOR ALL
  USING (organization_id = public.get_user_organization_id());

-- Lead meta
CREATE POLICY "Users can view lead meta"
  ON public.lead_meta FOR SELECT
  USING (lead_id IN (SELECT id FROM public.leads WHERE organization_id = public.get_user_organization_id()));

CREATE POLICY "Users can manage lead meta"
  ON public.lead_meta FOR ALL
  USING (lead_id IN (SELECT id FROM public.leads WHERE organization_id = public.get_user_organization_id()));

-- Lead tags
CREATE POLICY "Users can view lead tags"
  ON public.lead_tags FOR SELECT
  USING (lead_id IN (SELECT id FROM public.leads WHERE organization_id = public.get_user_organization_id()));

CREATE POLICY "Users can manage lead tags"
  ON public.lead_tags FOR ALL
  USING (lead_id IN (SELECT id FROM public.leads WHERE organization_id = public.get_user_organization_id()));

-- Activities
CREATE POLICY "Users can view org activities"
  ON public.activities FOR SELECT
  USING (lead_id IN (SELECT id FROM public.leads WHERE organization_id = public.get_user_organization_id()));

CREATE POLICY "Users can create activities"
  ON public.activities FOR INSERT
  WITH CHECK (lead_id IN (SELECT id FROM public.leads WHERE organization_id = public.get_user_organization_id()));

-- Cadence templates
CREATE POLICY "Users can view cadence templates"
  ON public.cadence_templates FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Admins can manage cadence templates"
  ON public.cadence_templates FOR ALL
  USING (organization_id = public.get_user_organization_id() AND public.is_admin());

-- Cadence task templates
CREATE POLICY "Users can view cadence task templates"
  ON public.cadence_tasks_template FOR SELECT
  USING (cadence_template_id IN (SELECT id FROM public.cadence_templates WHERE organization_id = public.get_user_organization_id()));

CREATE POLICY "Admins can manage cadence task templates"
  ON public.cadence_tasks_template FOR ALL
  USING (cadence_template_id IN (SELECT id FROM public.cadence_templates WHERE organization_id = public.get_user_organization_id()) AND public.is_admin());

-- Lead tasks
CREATE POLICY "Users can view lead tasks"
  ON public.lead_tasks FOR SELECT
  USING (lead_id IN (SELECT id FROM public.leads WHERE organization_id = public.get_user_organization_id()));

CREATE POLICY "Users can manage lead tasks"
  ON public.lead_tasks FOR ALL
  USING (lead_id IN (SELECT id FROM public.leads WHERE organization_id = public.get_user_organization_id()));

-- Round robins
CREATE POLICY "Users can view round robins"
  ON public.round_robins FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Admins can manage round robins"
  ON public.round_robins FOR ALL
  USING (organization_id = public.get_user_organization_id() AND public.is_admin());

-- Round robin rules
CREATE POLICY "Users can view round robin rules"
  ON public.round_robin_rules FOR SELECT
  USING (round_robin_id IN (SELECT id FROM public.round_robins WHERE organization_id = public.get_user_organization_id()));

CREATE POLICY "Admins can manage round robin rules"
  ON public.round_robin_rules FOR ALL
  USING (round_robin_id IN (SELECT id FROM public.round_robins WHERE organization_id = public.get_user_organization_id()) AND public.is_admin());

-- Round robin members
CREATE POLICY "Users can view round robin members"
  ON public.round_robin_members FOR SELECT
  USING (round_robin_id IN (SELECT id FROM public.round_robins WHERE organization_id = public.get_user_organization_id()));

CREATE POLICY "Admins can manage round robin members"
  ON public.round_robin_members FOR ALL
  USING (round_robin_id IN (SELECT id FROM public.round_robins WHERE organization_id = public.get_user_organization_id()) AND public.is_admin());

-- Assignments log
CREATE POLICY "Users can view assignments log"
  ON public.assignments_log FOR SELECT
  USING (lead_id IN (SELECT id FROM public.leads WHERE organization_id = public.get_user_organization_id()));

CREATE POLICY "System can create assignments"
  ON public.assignments_log FOR INSERT
  WITH CHECK (lead_id IN (SELECT id FROM public.leads WHERE organization_id = public.get_user_organization_id()));

-- Meta integrations
CREATE POLICY "Users can view meta integration"
  ON public.meta_integrations FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Admins can manage meta integration"
  ON public.meta_integrations FOR ALL
  USING (organization_id = public.get_user_organization_id() AND public.is_admin());

-- Property sequences
CREATE POLICY "Users can view property sequences"
  ON public.property_sequences FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can manage property sequences"
  ON public.property_sequences FOR ALL
  USING (organization_id = public.get_user_organization_id());

-- Function to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_meta_integrations_updated_at
  BEFORE UPDATE ON public.meta_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default permissions
INSERT INTO public.permissions (key, description) VALUES
  ('pipelines:read', 'Visualizar pipelines'),
  ('pipelines:write', 'Criar e editar pipelines'),
  ('leads:read', 'Visualizar leads'),
  ('leads:write', 'Criar e editar leads'),
  ('leads:assign', 'Atribuir leads a usuários'),
  ('leads:delete', 'Excluir leads'),
  ('properties:read', 'Visualizar imóveis'),
  ('properties:write', 'Criar e editar imóveis'),
  ('properties:delete', 'Excluir imóveis'),
  ('tags:read', 'Visualizar tags'),
  ('tags:write', 'Criar e editar tags'),
  ('cadences:read', 'Visualizar cadências'),
  ('cadences:write', 'Criar e editar cadências'),
  ('round_robin:read', 'Visualizar roletas'),
  ('round_robin:write', 'Criar e editar roletas'),
  ('settings:manage', 'Gerenciar configurações'),
  ('users:read', 'Visualizar usuários'),
  ('users:write', 'Criar e editar usuários'),
  ('meta:connect', 'Conectar integração Meta');