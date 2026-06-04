-- ============================================
-- SCHEMA COMPLETO - VIMOB CRM
-- Gerado em: 2026-01-17
-- Versão: Consolidada com todas as 77 migrações
-- ============================================
-- INSTRUÇÕES DE EXECUÇÃO:
-- 1. Acesse o SQL Editor dos s Supabase externo
-- 2. Execute este arquivo em PARTES (recomendado):
--    - Parte 1: Extensões e ENUMs (linhas 1-50)
--    - Parte 2: Funções Auxiliares (linhas 51-500)
--    - Parte 3: Tabelas Principais (linhas 501-1200)
--    - Parte 4: Triggers (linhas 1201-1500)
--    - Parte 5: RLS Policies (linhas 1501-2500)
--    - Parte 6: Storage e Realtime (linhas 2501-2700)
--    - Parte 7: Dados Iniciais (linhas 2701-fim)
-- ============================================

-- ============================================
-- PARTE 1: EXTENSÕES E ENUMS
-- ============================================

-- Extensões (geralmente já estão habilitadas no Supabase)
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA pg_catalog;
-- CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA extensions;

-- Drop tipos existentes para recriar (caso esteja fazendo update)
DO $$ BEGIN
  DROP TYPE IF EXISTS public.app_role CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP TYPE IF EXISTS public.lead_source CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP TYPE IF EXISTS public.task_type CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP TYPE IF EXISTS public.round_robin_strategy CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ENUMs (Tipos Customizados)
CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'super_admin');

CREATE TYPE public.lead_source AS ENUM (
  'meta', 'site', 'manual', 'wordpress', 'whatsapp', 
  'facebook', 'instagram', 'import', 'google', 'indicacao', 'outros', 'webhook'
);

CREATE TYPE public.task_type AS ENUM ('call', 'message', 'email', 'note', 'task', 'meeting', 'whatsapp');

CREATE TYPE public.round_robin_strategy AS ENUM ('simple', 'weighted');


-- ============================================
-- PARTE 2: FUNÇÕES AUXILIARES (SECURITY DEFINER)
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

-- Cache de organização do usuário (mais rápido)
CREATE OR REPLACE FUNCTION public.auth_org_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT organization_id FROM public.user_org_cache WHERE user_id = auth.uid()
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

-- Função para verificar se usuário é super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
$$;

-- Função para verificar se é admin da organização
CREATE OR REPLACE FUNCTION public.is_org_admin(_org_id uuid DEFAULT NULL::uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(), 'admin') AND (
    _org_id IS NULL OR public.auth_org_id() = _org_id
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

-- Função para obter IDs dos membros das equipes lideradas
CREATE OR REPLACE FUNCTION public.get_led_team_member_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT tm.user_id 
  FROM public.team_members tm
  WHERE tm.team_id IN (
    SELECT team_id FROM public.team_members 
    WHERE user_id = auth.uid() AND is_leader = true
  )
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

-- Função para verificar se tem módulo habilitado
CREATE OR REPLACE FUNCTION public.has_module(_module text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT is_enabled FROM public.organization_modules
      WHERE organization_id = public.auth_org_id()
      AND module_name = _module
    ),
    true
  ) OR public.is_super_admin()
$$;

-- Função para normalizar telefone
CREATE OR REPLACE FUNCTION public.normalize_phone(phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
BEGIN
  IF phone IS NULL OR phone = '' THEN
    RETURN NULL;
  END IF;
  phone := regexp_replace(phone, '[^0-9]', '', 'g');
  IF length(phone) >= 12 AND phone LIKE '55%' THEN
    phone := substring(phone from 3);
  END IF;
  RETURN phone;
END;
$$;

-- Função para criar notificação
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid, 
  p_organization_id uuid, 
  p_title text, 
  p_content text DEFAULT NULL::text, 
  p_type text DEFAULT 'info'::text, 
  p_lead_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO public.notifications (
    user_id,
    organization_id,
    title,
    content,
    type,
    lead_id,
    is_read
  ) VALUES (
    p_user_id,
    p_organization_id,
    p_title,
    p_content,
    p_type,
    p_lead_id,
    false
  )
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- Função para obter convite por token
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(_token text)
RETURNS TABLE(id uuid, email text, role app_role, organization_id uuid, expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT i.id, i.email, i.role, i.organization_id, i.expires_at
  FROM public.invitations i
  WHERE i.token = _token
  AND i.used_at IS NULL
  AND i.expires_at > now()
  LIMIT 1;
END;
$$;

-- Função para sincronizar cache de organização
CREATE OR REPLACE FUNCTION public.sync_user_org_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_org_cache (user_id, organization_id, updated_at)
  VALUES (NEW.id, NEW.organization_id, now())
  ON CONFLICT (user_id) DO UPDATE SET 
    organization_id = EXCLUDED.organization_id,
    updated_at = now();
  RETURN NEW;
END;
$$;

-- Função para sincronizar role do usuário
CREATE OR REPLACE FUNCTION public.sync_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.role = 'admin' AND NEW.role != 'admin' THEN
    DELETE FROM public.user_roles 
    WHERE user_id = NEW.id AND role = 'admin';
  END IF;
  
  IF NEW.role = 'admin' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Função para forçar organization_id
CREATE OR REPLACE FUNCTION public.enforce_organization_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  caller_org uuid;
  jwt_role text;
BEGIN
  BEGIN
    jwt_role := current_setting('request.jwt.claims', true)::json->>'role';
  EXCEPTION WHEN OTHERS THEN
    jwt_role := NULL;
  END;
  
  IF jwt_role = 'service_role' THEN
    IF NEW.organization_id IS NULL THEN
      RAISE EXCEPTION 'organization_id é obrigatório para service_role';
    END IF;
    RETURN NEW;
  END IF;
  
  IF public.is_super_admin() THEN
    IF NEW.organization_id IS NULL THEN
      RAISE EXCEPTION 'Super admin deve especificar organization_id';
    END IF;
    RETURN NEW;
  END IF;
  
  caller_org := public.auth_org_id();
  
  IF caller_org IS NULL THEN
    RAISE EXCEPTION 'Usuário não possui organização associada';
  END IF;
  
  NEW.organization_id := caller_org;
  RETURN NEW;
END;
$$;

-- Função para log de auditoria
CREATE OR REPLACE FUNCTION public.log_audit(
  p_action text, 
  p_entity_type text DEFAULT NULL::text, 
  p_entity_id uuid DEFAULT NULL::uuid, 
  p_old_data jsonb DEFAULT NULL::jsonb, 
  p_new_data jsonb DEFAULT NULL::jsonb, 
  p_ip_address text DEFAULT NULL::text, 
  p_user_agent text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_log_id uuid;
  v_org_id uuid;
BEGIN
  v_org_id := public.auth_org_id();
  
  INSERT INTO public.audit_logs (
    user_id, 
    organization_id, 
    action, 
    entity_type,
    entity_id, 
    old_data, 
    new_data,
    ip_address,
    user_agent
  ) VALUES (
    auth.uid(), 
    v_org_id, 
    p_action, 
    p_entity_type,
    p_entity_id, 
    p_old_data, 
    p_new_data,
    p_ip_address,
    p_user_agent
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Função para verificar acesso a sessão WhatsApp
CREATE OR REPLACE FUNCTION public.user_has_session_access(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_session_access
    WHERE session_id = p_session_id
    AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.user_owns_session(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_sessions
    WHERE id = p_session_id
    AND owner_user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.session_in_user_org(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_sessions
    WHERE id = p_session_id
    AND organization_id = public.get_user_organization_id()
  )
$$;


-- ============================================
-- PARTE 3: TABELAS PRINCIPAIS
-- ============================================

-- 3.1 Organizações (Tenants)
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  logo_size integer DEFAULT 32,
  accent_color text DEFAULT '#0891b2',
  segment text DEFAULT 'imobiliário',
  theme_mode text DEFAULT 'light',
  
  -- Dados empresariais
  razao_social text,
  nome_fantasia text,
  cnpj text,
  inscricao_estadual text,
  
  -- Endereço
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  cep text,
  
  -- Contato
  telefone text,
  whatsapp text,
  email text,
  website text,
  
  -- Admin
  admin_notes text,
  max_users integer DEFAULT 10,
  subscription_status text DEFAULT 'active',
  is_active boolean DEFAULT true,
  last_access_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.2 Cache de Organização do Usuário
CREATE TABLE IF NOT EXISTS public.user_org_cache (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  updated_at timestamptz DEFAULT now()
);

-- 3.3 Usuários (Perfis)
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL,
  avatar_url text,
  role app_role NOT NULL DEFAULT 'user',
  organization_id uuid REFERENCES public.organizations(id),
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.4 Roles de Usuário
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

-- 3.5 Permissões
CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  description text
);

-- 3.6 Permissões de Usuário
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE
);

-- 3.7 Equipes
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 3.8 Membros de Equipe
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  is_leader boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 3.9 Pipelines
CREATE TABLE IF NOT EXISTS public.pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean DEFAULT false,
  default_round_robin_id uuid,
  first_response_start text DEFAULT 'lead_created',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.10 Pipelines por Equipe
CREATE TABLE IF NOT EXISTS public.team_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id, pipeline_id)
);

-- 3.11 Estágios do Pipeline
CREATE TABLE IF NOT EXISTS public.stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  stage_key text NOT NULL,
  color text DEFAULT '#6b7280',
  position integer NOT NULL DEFAULT 0
);

-- 3.12 Configurações de SLA do Pipeline
CREATE TABLE IF NOT EXISTS public.pipeline_sla_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE UNIQUE,
  is_active boolean DEFAULT false,
  first_response_target_seconds integer DEFAULT 300,
  warn_after_seconds integer DEFAULT 180,
  overdue_after_seconds integer DEFAULT 300,
  notify_assignee boolean DEFAULT true,
  notify_manager boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3.13 Tags
CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.14 Tipos de Imóveis
CREATE TABLE IF NOT EXISTS public.property_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 3.15 Características de Imóveis
CREATE TABLE IF NOT EXISTS public.property_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 3.16 Proximidades de Imóveis
CREATE TABLE IF NOT EXISTS public.property_proximities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 3.17 Sequências de Código de Imóveis
CREATE TABLE IF NOT EXISTS public.property_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  prefix text NOT NULL,
  last_number integer DEFAULT 0
);

-- 3.18 Imóveis
CREATE TABLE IF NOT EXISTS public.properties (
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
  
  -- Extras
  caracteristicas jsonb DEFAULT '[]'::jsonb,
  proximidades jsonb DEFAULT '[]'::jsonb,
  
  -- Mídia
  imagem_principal text,
  fotos jsonb DEFAULT '[]'::jsonb,
  video_imovel text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.19 Leads
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pipeline_id uuid REFERENCES public.pipelines(id),
  stage_id uuid REFERENCES public.stages(id),
  assigned_user_id uuid REFERENCES public.users(id),
  property_id uuid REFERENCES public.properties(id),
  
  -- Dados básicos
  name text NOT NULL,
  email text,
  phone text,
  message text,
  property_code text,
  source lead_source NOT NULL DEFAULT 'manual',
  source_detail text,
  campaign_name text,
  
  -- Endereço
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  cep text,
  
  -- Qualificação
  empresa text,
  cargo text,
  renda_familiar text,
  trabalha boolean,
  profissao text,
  faixa_valor_imovel text,
  finalidade_compra text,
  procura_financiamento boolean,
  valor_interesse numeric,
  
  -- Campos customizados
  custom_fields jsonb,
  
  -- Meta Ads
  meta_lead_id text,
  meta_form_id text,
  
  -- Timestamps de atribuição
  assigned_at timestamptz,
  stage_entered_at timestamptz DEFAULT now(),
  
  -- SLA / Tempo de resposta
  first_touch_at timestamptz,
  first_touch_channel text,
  first_touch_actor_user_id uuid REFERENCES public.users(id),
  first_touch_seconds integer,
  
  first_response_at timestamptz,
  first_response_channel text,
  first_response_actor_user_id uuid REFERENCES public.users(id),
  first_response_seconds integer,
  first_response_is_automation boolean,
  
  sla_status text,
  sla_seconds_elapsed integer,
  sla_last_checked_at timestamptz,
  sla_notified_warning_at timestamptz,
  sla_notified_overdue_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.20 Tags de Leads (N:N)
CREATE TABLE IF NOT EXISTS public.lead_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  UNIQUE(lead_id, tag_id)
);

-- 3.21 Metadados de Leads (Meta Ads)
CREATE TABLE IF NOT EXISTS public.lead_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_id text,
  ad_name text,
  form_id text,
  page_id text,
  platform text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.22 Tarefas de Leads
CREATE TABLE IF NOT EXISTS public.lead_tasks (
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

-- 3.23 Timeline de Eventos do Lead
CREATE TABLE IF NOT EXISTS public.lead_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES public.users(id),
  channel text,
  is_automation boolean DEFAULT false,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.24 Atividades
CREATE TABLE IF NOT EXISTS public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id),
  type text NOT NULL,
  content text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.25 Eventos de Agenda
CREATE TABLE IF NOT EXISTS public.schedule_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  event_type text DEFAULT 'meeting',
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  is_completed boolean DEFAULT false,
  google_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.26 Tokens do Google Calendar
CREATE TABLE IF NOT EXISTS public.google_calendar_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  calendar_id text,
  is_sync_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3.27 Templates de Cadência
CREATE TABLE IF NOT EXISTS public.cadence_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  stage_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.28 Tarefas de Template de Cadência
CREATE TABLE IF NOT EXISTS public.cadence_tasks_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cadence_template_id uuid NOT NULL REFERENCES public.cadence_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  type task_type NOT NULL DEFAULT 'call',
  day_offset integer NOT NULL DEFAULT 0,
  position integer DEFAULT 0,
  observation text,
  recommended_message text
);

-- 3.29 Round Robins
CREATE TABLE IF NOT EXISTS public.round_robins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  strategy round_robin_strategy NOT NULL DEFAULT 'simple',
  is_active boolean DEFAULT true,
  last_assigned_index integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Adicionar FK no pipelines após criar round_robins
DO $$ BEGIN
  ALTER TABLE public.pipelines 
  ADD CONSTRAINT pipelines_default_round_robin_fkey 
  FOREIGN KEY (default_round_robin_id) REFERENCES public.round_robins(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3.30 Regras de Round Robin
CREATE TABLE IF NOT EXISTS public.round_robin_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  round_robin_id uuid NOT NULL REFERENCES public.round_robins(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Regra',
  priority integer DEFAULT 0,
  match jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 3.31 Membros de Round Robin
CREATE TABLE IF NOT EXISTS public.round_robin_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_robin_id uuid NOT NULL REFERENCES public.round_robins(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id),
  weight integer DEFAULT 1,
  position integer NOT NULL DEFAULT 0,
  leads_count integer DEFAULT 0
);

-- 3.32 Log de Atribuições
CREATE TABLE IF NOT EXISTS public.assignments_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  assigned_user_id uuid REFERENCES public.users(id),
  round_robin_id uuid REFERENCES public.round_robins(id),
  rule_id uuid REFERENCES public.round_robin_rules(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.33 Notificações
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  lead_id uuid REFERENCES public.leads(id),
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  content text,
  is_read boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.34 Convites
CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text,
  role app_role DEFAULT 'user',
  token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_by uuid REFERENCES public.users(id),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 3.35 Integrações Meta (Facebook Ads)
CREATE TABLE IF NOT EXISTS public.meta_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
  access_token text,
  page_id text,
  page_name text,
  form_ids jsonb DEFAULT '[]'::jsonb,
  field_mapping jsonb DEFAULT '{}'::jsonb,
  campaign_property_mapping jsonb DEFAULT '[]'::jsonb,
  pipeline_id uuid REFERENCES public.pipelines(id),
  stage_id uuid REFERENCES public.stages(id),
  default_status text,
  is_connected boolean DEFAULT false,
  last_sync_at timestamptz,
  last_lead_at timestamptz,
  leads_received integer DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.36 Configurações de Formulário Meta
CREATE TABLE IF NOT EXISTS public.meta_form_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.meta_integrations(id) ON DELETE CASCADE,
  form_id text NOT NULL,
  form_name text,
  is_active boolean DEFAULT true,
  pipeline_id uuid REFERENCES public.pipelines(id),
  stage_id uuid REFERENCES public.stages(id),
  property_id uuid REFERENCES public.properties(id),
  assigned_user_id uuid REFERENCES public.users(id),
  assigned_team_id uuid REFERENCES public.teams(id),
  auto_tags jsonb DEFAULT '[]'::jsonb,
  default_status text,
  field_mapping jsonb,
  custom_fields_config jsonb,
  leads_received integer DEFAULT 0,
  last_lead_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3.37 Integrações WordPress
CREATE TABLE IF NOT EXISTS public.wordpress_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  is_active boolean DEFAULT true,
  pipeline_id uuid REFERENCES public.pipelines(id),
  stage_id uuid REFERENCES public.stages(id),
  leads_received integer DEFAULT 0,
  last_lead_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.38 Integrações de Webhook Genérico
CREATE TABLE IF NOT EXISTS public.webhooks_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  webhook_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  is_active boolean DEFAULT true,
  pipeline_id uuid REFERENCES public.pipelines(id),
  stage_id uuid REFERENCES public.stages(id),
  field_mapping jsonb DEFAULT '{}'::jsonb,
  auto_tags jsonb DEFAULT '[]'::jsonb,
  last_triggered_at timestamptz,
  leads_received integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3.39 Sessões WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
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
  last_connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.40 Acesso a Sessões WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_session_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  can_view boolean DEFAULT true,
  can_send boolean DEFAULT true,
  granted_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, user_id)
);

-- 3.41 Conversas WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id),
  remote_jid text NOT NULL,
  contact_name text,
  contact_phone text,
  contact_picture text,
  is_group boolean DEFAULT false,
  last_message text,
  last_message_at timestamptz,
  unread_count integer DEFAULT 0,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, remote_jid)
);

-- 3.42 Mensagens WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
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
  media_filename text,
  sender_jid text,
  sender_name text,
  quoted_message_id text,
  quoted_content text,
  message_key jsonb,
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  read_at timestamptz,
  UNIQUE(conversation_id, message_id)
);

-- 3.43 Tokens WPP
CREATE TABLE IF NOT EXISTS public.wpp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE UNIQUE,
  token text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 3.44 Fila de Mensagens (Outbox)
CREATE TABLE IF NOT EXISTS public.outbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.whatsapp_conversations(id) ON DELETE SET NULL,
  remote_jid text NOT NULL,
  content text,
  message_type text DEFAULT 'text',
  media_url text,
  media_caption text,
  status text DEFAULT 'pending',
  attempts integer DEFAULT 0,
  max_attempts integer DEFAULT 3,
  next_retry_at timestamptz DEFAULT now(),
  sent_message_id text,
  error_message text,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3.45 Jobs de Mídia
CREATE TABLE IF NOT EXISTS public.media_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.whatsapp_sessions(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.whatsapp_messages(id) ON DELETE CASCADE,
  remote_jid text,
  message_key jsonb,
  media_type text NOT NULL,
  media_mime_type text,
  status text DEFAULT 'pending',
  attempts integer DEFAULT 0,
  max_attempts integer DEFAULT 5,
  next_retry_at timestamptz DEFAULT now(),
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3.46 Contratos
CREATE TABLE IF NOT EXISTS public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_number text NOT NULL,
  type text NOT NULL,
  status text DEFAULT 'draft',
  
  -- Cliente
  client_name text NOT NULL,
  client_email text,
  client_phone text,
  client_document text,
  
  -- Referências
  lead_id uuid REFERENCES public.leads(id),
  property_id uuid REFERENCES public.properties(id),
  
  -- Valores
  total_value numeric DEFAULT 0,
  down_payment numeric,
  installments integer,
  payment_conditions text,
  
  -- Datas
  start_date date,
  end_date date,
  signing_date date,
  
  -- Extra
  notes text,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3.47 Corretores do Contrato
CREATE TABLE IF NOT EXISTS public.contract_brokers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text,
  commission_percentage numeric DEFAULT 0,
  commission_value numeric,
  created_at timestamptz DEFAULT now()
);

-- 3.48 Sequências de Contrato
CREATE TABLE IF NOT EXISTS public.contract_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
  last_number integer DEFAULT 0
);

-- 3.49 Categorias Financeiras
CREATE TABLE IF NOT EXISTS public.financial_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 3.50 Lançamentos Financeiros
CREATE TABLE IF NOT EXISTS public.financial_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type text NOT NULL,
  description text NOT NULL,
  value numeric NOT NULL,
  due_date date NOT NULL,
  competence_date date,
  status text DEFAULT 'pending',
  paid_at timestamptz,
  paid_value numeric,
  payment_method text,
  
  -- Referências
  category_id uuid REFERENCES public.financial_categories(id),
  contract_id uuid REFERENCES public.contracts(id),
  property_id uuid REFERENCES public.properties(id),
  parent_entry_id uuid REFERENCES public.financial_entries(id),
  
  -- Pessoa relacionada
  related_person_type text,
  related_person_id uuid,
  related_person_name text,
  
  -- Parcelamento
  installment_number integer,
  total_installments integer,
  
  -- Extra
  notes text,
  attachments jsonb,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3.51 Regras de Comissão
CREATE TABLE IF NOT EXISTS public.commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  business_type text NOT NULL,
  commission_type text NOT NULL,
  commission_value numeric NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 3.52 Comissões
CREATE TABLE IF NOT EXISTS public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  contract_id uuid REFERENCES public.contracts(id),
  property_id uuid REFERENCES public.properties(id),
  rule_id uuid REFERENCES public.commission_rules(id),
  
  base_value numeric NOT NULL,
  percentage numeric,
  calculated_value numeric NOT NULL,
  
  status text DEFAULT 'pending',
  forecast_date date,
  
  approved_at timestamptz,
  approved_by uuid,
  paid_at timestamptz,
  paid_by uuid,
  payment_proof text,
  
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3.53 Automações de Estágio
CREATE TABLE IF NOT EXISTS public.stage_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_on text NOT NULL,
  action_type text NOT NULL,
  action_config jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 3.54 Log de Automações
CREATE TABLE IF NOT EXISTS public.automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  automation_id uuid REFERENCES public.stage_automations(id),
  lead_id uuid REFERENCES public.leads(id),
  action_taken text NOT NULL,
  details jsonb,
  executed_at timestamptz DEFAULT now()
);

-- 3.55 Automações (Flow)
CREATE TABLE IF NOT EXISTS public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL,
  trigger_config jsonb,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3.56 Nós de Automação
CREATE TABLE IF NOT EXISTS public.automation_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  node_type text NOT NULL,
  action_type text,
  config jsonb DEFAULT '{}'::jsonb,
  position_x numeric,
  position_y numeric,
  created_at timestamptz DEFAULT now()
);

-- 3.57 Conexões de Automação
CREATE TABLE IF NOT EXISTS public.automation_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES public.automation_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES public.automation_nodes(id) ON DELETE CASCADE,
  source_handle text,
  condition_branch text
);

-- 3.58 Execuções de Automação
CREATE TABLE IF NOT EXISTS public.automation_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  automation_id uuid REFERENCES public.automations(id),
  lead_id uuid REFERENCES public.leads(id),
  conversation_id uuid REFERENCES public.whatsapp_conversations(id),
  current_node_id uuid REFERENCES public.automation_nodes(id),
  status text DEFAULT 'running',
  execution_data jsonb,
  started_at timestamptz DEFAULT now(),
  next_execution_at timestamptz,
  completed_at timestamptz,
  error_message text
);

-- 3.59 Templates de Automação
CREATE TABLE IF NOT EXISTS public.automation_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  content text NOT NULL,
  media_type text,
  media_url text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3.60 Logs de Auditoria
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id),
  organization_id uuid REFERENCES public.organizations(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- 3.61 Chamadas de Telefonia
CREATE TABLE IF NOT EXISTS public.telephony_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_call_id text,
  user_id uuid REFERENCES public.users(id),
  lead_id uuid REFERENCES public.leads(id),
  
  direction text NOT NULL,
  phone_from text,
  phone_to text,
  
  status text DEFAULT 'initiated',
  outcome text,
  
  initiated_at timestamptz DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  
  duration_seconds integer,
  talk_time_seconds integer,
  
  recording_url text,
  recording_status text DEFAULT 'none',
  recording_duration_sec integer,
  
  external_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3.62 Auditoria de Gravações
CREATE TABLE IF NOT EXISTS public.telephony_recording_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.telephony_calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id),
  action text NOT NULL,
  ip_address text,
  user_agent text,
  accessed_at timestamptz DEFAULT now()
);

-- 3.63 Configurações do Sistema
CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now()
);

-- 3.64 Módulos da Organização
CREATE TABLE IF NOT EXISTS public.organization_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  module_name text NOT NULL,
  is_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, module_name)
);

-- 3.65 Sessões de Super Admin
CREATE TABLE IF NOT EXISTS public.super_admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  reason text
);


-- ============================================
-- PARTE 4: ÍNDICES DE PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_users_organization ON public.users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

CREATE INDEX IF NOT EXISTS idx_leads_organization ON public.leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_pipeline ON public.leads(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON public.leads(stage_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_user ON public.leads(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_sla_status ON public.leads(sla_status);
CREATE INDEX IF NOT EXISTS idx_leads_source ON public.leads(source);

CREATE INDEX IF NOT EXISTS idx_activities_lead ON public.activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON public.activities(created_at);

CREATE INDEX IF NOT EXISTS idx_lead_tasks_lead ON public.lead_tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_due_date ON public.lead_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_is_done ON public.lead_tasks(is_done);

CREATE INDEX IF NOT EXISTS idx_lead_timeline_events_lead ON public.lead_timeline_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_timeline_events_event_at ON public.lead_timeline_events(event_at);
CREATE INDEX IF NOT EXISTS idx_lead_timeline_events_event_type ON public.lead_timeline_events(event_type);

CREATE INDEX IF NOT EXISTS idx_stages_pipeline ON public.stages(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_stages_position ON public.stages(position);

CREATE INDEX IF NOT EXISTS idx_team_members_team ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_is_leader ON public.team_members(is_leader);

CREATE INDEX IF NOT EXISTS idx_properties_organization ON public.properties(organization_id);
CREATE INDEX IF NOT EXISTS idx_properties_code ON public.properties(code);
CREATE INDEX IF NOT EXISTS idx_properties_status ON public.properties(status);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_organization ON public.whatsapp_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_status ON public.whatsapp_sessions(status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_session ON public.whatsapp_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_lead ON public.whatsapp_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_remote_jid ON public.whatsapp_conversations(remote_jid);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_last_message_at ON public.whatsapp_conversations(last_message_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_contact_phone ON public.whatsapp_conversations(session_id, contact_phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_archived ON public.whatsapp_conversations(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_deleted ON public.whatsapp_conversations(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation ON public.whatsapp_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_session ON public.whatsapp_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_sent_at ON public.whatsapp_messages(sent_at);

CREATE INDEX IF NOT EXISTS idx_schedule_events_user ON public.schedule_events(user_id);
CREATE INDEX IF NOT EXISTS idx_schedule_events_start_at ON public.schedule_events(start_at);

CREATE INDEX IF NOT EXISTS idx_contracts_organization ON public.contracts(organization_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON public.contracts(status);

CREATE INDEX IF NOT EXISTS idx_financial_entries_organization ON public.financial_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_financial_entries_due_date ON public.financial_entries(due_date);
CREATE INDEX IF NOT EXISTS idx_financial_entries_status ON public.financial_entries(status);

CREATE INDEX IF NOT EXISTS idx_audit_logs_organization ON public.audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_telephony_calls_organization ON public.telephony_calls(organization_id);
CREATE INDEX IF NOT EXISTS idx_telephony_calls_user ON public.telephony_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_telephony_calls_lead ON public.telephony_calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_telephony_calls_external_id ON public.telephony_calls(external_call_id);

CREATE INDEX IF NOT EXISTS idx_outbox_messages_status ON public.outbox_messages(status);
CREATE INDEX IF NOT EXISTS idx_outbox_messages_next_retry ON public.outbox_messages(next_retry_at);

CREATE INDEX IF NOT EXISTS idx_media_jobs_status ON public.media_jobs(status);
CREATE INDEX IF NOT EXISTS idx_media_jobs_next_retry ON public.media_jobs(next_retry_at);


-- ============================================
-- PARTE 5: TRIGGERS
-- ============================================

-- Triggers de updated_at
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

CREATE TRIGGER update_contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_financial_entries_updated_at
  BEFORE UPDATE ON public.financial_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_schedule_events_updated_at
  BEFORE UPDATE ON public.schedule_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_automations_updated_at
  BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_telephony_calls_updated_at
  BEFORE UPDATE ON public.telephony_calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para sincronizar cache de organização
CREATE TRIGGER sync_user_org_cache_trigger
  AFTER INSERT OR UPDATE OF organization_id ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_org_cache();

-- Trigger para sincronizar roles
CREATE TRIGGER sync_user_role_trigger
  AFTER INSERT OR UPDATE OF role ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_role();


-- ============================================
-- PARTE 6: HABILITAR ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_org_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_sla_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_proximities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_tasks_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_robins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_robin_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_robin_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_form_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wordpress_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_session_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wpp_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telephony_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telephony_recording_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admin_sessions ENABLE ROW LEVEL SECURITY;


-- ============================================
-- PARTE 7: ROW LEVEL SECURITY POLICIES
-- ============================================

-- Organizations
CREATE POLICY "Users can view their organization"
  ON public.organizations FOR SELECT
  USING (id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "New users can create organization during onboarding"
  ON public.organizations FOR INSERT
  WITH CHECK (NOT user_has_organization() OR is_super_admin());

CREATE POLICY "Admins can update their organization"
  ON public.organizations FOR UPDATE
  USING ((id = get_user_organization_id() AND is_admin()) OR is_super_admin());

CREATE POLICY "Super admin can manage all organizations"
  ON public.organizations FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Users
CREATE POLICY "Users can view organization members"
  ON public.users FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Users can insert their profile"
  ON public.users FOR INSERT
  WITH CHECK (id = auth.uid() OR is_super_admin());

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (id = auth.uid() OR (organization_id = get_user_organization_id() AND is_admin()) OR is_super_admin());

CREATE POLICY "Super admin can manage all users"
  ON public.users FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- User Org Cache
CREATE POLICY "Users can view their org cache"
  ON public.user_org_cache FOR SELECT
  USING (user_id = auth.uid() OR is_super_admin());

CREATE POLICY "System can manage org cache"
  ON public.user_org_cache FOR ALL
  USING (true);

-- User Roles
CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (is_admin() OR is_super_admin());

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
    ) OR is_super_admin()
  );

-- Permissions
CREATE POLICY "Anyone can read permissions"
  ON public.permissions FOR SELECT
  USING (true);

-- User Permissions
CREATE POLICY "Admins can manage user permissions"
  ON public.user_permissions FOR ALL
  USING (is_admin() OR is_super_admin());

CREATE POLICY "Users can view permissions in org"
  ON public.user_permissions FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM public.users 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

-- Teams
CREATE POLICY "Users can view org teams"
  ON public.teams FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Admins can manage teams"
  ON public.teams FOR ALL
  USING ((organization_id = get_user_organization_id() AND is_admin()) OR is_super_admin());

-- Team Members
CREATE POLICY "Users can view team members"
  ON public.team_members FOR SELECT
  USING (
    team_id IN (
      SELECT id FROM public.teams 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

CREATE POLICY "Admins can manage team members"
  ON public.team_members FOR ALL
  USING (
    (team_id IN (
      SELECT id FROM public.teams 
      WHERE organization_id = get_user_organization_id()
    ) AND is_admin()) OR is_super_admin()
  );

-- Pipelines
CREATE POLICY "Hierarchical pipeline access"
  ON public.pipelines FOR SELECT
  USING (
    (organization_id = get_user_organization_id() 
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
    )) OR is_super_admin()
  );

CREATE POLICY "Admins can manage pipelines"
  ON public.pipelines FOR ALL
  USING ((organization_id = get_user_organization_id() AND is_admin()) OR is_super_admin());

-- Team Pipelines
CREATE POLICY "Users can view team pipelines in their org"
  ON public.team_pipelines FOR SELECT
  USING (
    team_id IN (
      SELECT id FROM public.teams 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

CREATE POLICY "Admins can manage team pipelines"
  ON public.team_pipelines FOR ALL
  USING (
    (team_id IN (
      SELECT id FROM public.teams 
      WHERE organization_id = get_user_organization_id()
    ) AND is_admin()) OR is_super_admin()
  );

-- Stages
CREATE POLICY "Users can view stages"
  ON public.stages FOR SELECT
  USING (
    pipeline_id IN (
      SELECT id FROM public.pipelines 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

CREATE POLICY "Admins can manage stages"
  ON public.stages FOR ALL
  USING (
    (pipeline_id IN (
      SELECT id FROM public.pipelines 
      WHERE organization_id = get_user_organization_id()
    ) AND is_admin()) OR is_super_admin()
  );

-- Pipeline SLA Settings
CREATE POLICY "Users can view pipeline sla settings"
  ON public.pipeline_sla_settings FOR SELECT
  USING (
    pipeline_id IN (
      SELECT id FROM public.pipelines 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

CREATE POLICY "Admins can manage pipeline sla settings"
  ON public.pipeline_sla_settings FOR ALL
  USING (
    (pipeline_id IN (
      SELECT id FROM public.pipelines 
      WHERE organization_id = get_user_organization_id()
    ) AND is_admin()) OR is_super_admin()
  );

-- Tags
CREATE POLICY "Users can view org tags"
  ON public.tags FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Users can manage tags"
  ON public.tags FOR ALL
  USING (organization_id = get_user_organization_id() OR is_super_admin());

-- Properties
CREATE POLICY "Users can view org properties"
  ON public.properties FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Users can manage properties"
  ON public.properties FOR ALL
  USING (organization_id = get_user_organization_id() OR is_super_admin());

-- Property Types, Features, Proximities, Sequences (similar pattern)
CREATE POLICY "Users can view property types"
  ON public.property_types FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Users can manage property types"
  ON public.property_types FOR ALL
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Users can view property features"
  ON public.property_features FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Users can manage property features"
  ON public.property_features FOR ALL
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Users can view property proximities"
  ON public.property_proximities FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Users can manage property proximities"
  ON public.property_proximities FOR ALL
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Users can view property sequences"
  ON public.property_sequences FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Users can manage property sequences"
  ON public.property_sequences FOR ALL
  USING (organization_id = get_user_organization_id() OR is_super_admin());

-- Leads
CREATE POLICY "Hierarchical lead access"
  ON public.leads FOR SELECT
  USING (
    (organization_id = get_user_organization_id()
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
    )) OR is_super_admin()
  );

CREATE POLICY "Hierarchical lead management"
  ON public.leads FOR ALL
  USING (
    (organization_id = get_user_organization_id()
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
    )) OR is_super_admin()
  );

-- Lead Tags
CREATE POLICY "Users can view lead tags"
  ON public.lead_tags FOR SELECT
  USING (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

CREATE POLICY "Users can manage lead tags"
  ON public.lead_tags FOR ALL
  USING (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

-- Lead Meta
CREATE POLICY "Users can view lead meta"
  ON public.lead_meta FOR SELECT
  USING (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

CREATE POLICY "Users can manage lead meta"
  ON public.lead_meta FOR ALL
  USING (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

-- Lead Tasks
CREATE POLICY "Users can view lead tasks"
  ON public.lead_tasks FOR SELECT
  USING (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

CREATE POLICY "Users can manage lead tasks"
  ON public.lead_tasks FOR ALL
  USING (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

-- Lead Timeline Events
CREATE POLICY "Users can view lead timeline events"
  ON public.lead_timeline_events FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Users can manage lead timeline events"
  ON public.lead_timeline_events FOR ALL
  USING (organization_id = get_user_organization_id() OR is_super_admin());

-- Activities
CREATE POLICY "Users can view org activities"
  ON public.activities FOR SELECT
  USING (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

CREATE POLICY "Users can create activities"
  ON public.activities FOR INSERT
  WITH CHECK (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

-- Schedule Events
CREATE POLICY "Users can view their schedule events"
  ON public.schedule_events FOR SELECT
  USING (
    (organization_id = get_user_organization_id() 
    AND (user_id = auth.uid() OR is_admin())) 
    OR is_super_admin()
  );

CREATE POLICY "Users can manage their schedule events"
  ON public.schedule_events FOR ALL
  USING (
    (organization_id = get_user_organization_id() 
    AND (user_id = auth.uid() OR is_admin())) 
    OR is_super_admin()
  );

-- Google Calendar Tokens
CREATE POLICY "Users can view their google calendar tokens"
  ON public.google_calendar_tokens FOR SELECT
  USING (user_id = auth.uid() OR is_super_admin());

CREATE POLICY "Users can manage their google calendar tokens"
  ON public.google_calendar_tokens FOR ALL
  USING (user_id = auth.uid() OR is_super_admin());

-- Cadence Templates
CREATE POLICY "Users can view cadence templates"
  ON public.cadence_templates FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Admins can manage cadence templates"
  ON public.cadence_templates FOR ALL
  USING ((organization_id = get_user_organization_id() AND is_admin()) OR is_super_admin());

-- Cadence Tasks Template
CREATE POLICY "Users can view cadence task templates"
  ON public.cadence_tasks_template FOR SELECT
  USING (
    cadence_template_id IN (
      SELECT id FROM public.cadence_templates 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

CREATE POLICY "Admins can manage cadence task templates"
  ON public.cadence_tasks_template FOR ALL
  USING (
    (cadence_template_id IN (
      SELECT id FROM public.cadence_templates 
      WHERE organization_id = get_user_organization_id()
    ) AND is_admin()) OR is_super_admin()
  );

-- Round Robins
CREATE POLICY "Users can view round robins"
  ON public.round_robins FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Admins can manage round robins"
  ON public.round_robins FOR ALL
  USING ((organization_id = get_user_organization_id() AND is_admin()) OR is_super_admin());

-- Round Robin Rules
CREATE POLICY "Users can view round robin rules"
  ON public.round_robin_rules FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Admins can manage round robin rules"
  ON public.round_robin_rules FOR ALL
  USING ((organization_id = get_user_organization_id() AND is_admin()) OR is_super_admin());

-- Round Robin Members
CREATE POLICY "Users can view round robin members"
  ON public.round_robin_members FOR SELECT
  USING (
    round_robin_id IN (
      SELECT id FROM public.round_robins 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

CREATE POLICY "Admins can manage round robin members"
  ON public.round_robin_members FOR ALL
  USING (
    (round_robin_id IN (
      SELECT id FROM public.round_robins 
      WHERE organization_id = get_user_organization_id()
    ) AND is_admin()) OR is_super_admin()
  );

-- Assignments Log
CREATE POLICY "Users can view assignments log"
  ON public.assignments_log FOR SELECT
  USING (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

CREATE POLICY "System can create assignments"
  ON public.assignments_log FOR INSERT
  WITH CHECK (
    lead_id IN (
      SELECT id FROM public.leads 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

-- Notifications
CREATE POLICY "Users can view their notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid() OR organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "System can create notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Users can update their notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid() OR is_super_admin());

CREATE POLICY "Users can delete their notifications"
  ON public.notifications FOR DELETE
  USING (user_id = auth.uid() OR is_super_admin());

-- Invitations
CREATE POLICY "Anyone can view invitation by token"
  ON public.invitations FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage invitations"
  ON public.invitations FOR ALL
  USING ((organization_id = get_user_organization_id() AND is_admin()) OR is_super_admin());

-- Meta Integrations
CREATE POLICY "Users can view meta integration"
  ON public.meta_integrations FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Admins can manage meta integration"
  ON public.meta_integrations FOR ALL
  USING ((organization_id = get_user_organization_id() AND is_admin()) OR is_super_admin());

-- Meta Form Configs
CREATE POLICY "Users can view meta form configs"
  ON public.meta_form_configs FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Admins can manage meta form configs"
  ON public.meta_form_configs FOR ALL
  USING ((organization_id = get_user_organization_id() AND is_admin()) OR is_super_admin());

-- WordPress Integrations
CREATE POLICY "Users can view wordpress integration"
  ON public.wordpress_integrations FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Admins can manage wordpress integration"
  ON public.wordpress_integrations FOR ALL
  USING ((organization_id = get_user_organization_id() AND is_admin()) OR is_super_admin());

-- Webhooks Integrations
CREATE POLICY "Users can view webhooks integrations"
  ON public.webhooks_integrations FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Admins can manage webhooks integrations"
  ON public.webhooks_integrations FOR ALL
  USING ((organization_id = get_user_organization_id() AND is_admin()) OR is_super_admin());

-- WhatsApp Sessions
CREATE POLICY "Users can view sessions they own or have access to"
  ON public.whatsapp_sessions FOR SELECT
  USING (
    (organization_id = get_user_organization_id()
    AND (
      owner_user_id = auth.uid()
      OR is_admin()
      OR id IN (
        SELECT session_id FROM public.whatsapp_session_access 
        WHERE user_id = auth.uid() AND can_view = true
      )
    )) OR is_super_admin()
  );

CREATE POLICY "Users can create sessions in their org"
  ON public.whatsapp_sessions FOR INSERT
  WITH CHECK (
    (organization_id = get_user_organization_id() 
    AND owner_user_id = auth.uid()) OR is_super_admin()
  );

CREATE POLICY "Session owners and admins can update"
  ON public.whatsapp_sessions FOR UPDATE
  USING (
    (organization_id = get_user_organization_id()
    AND (owner_user_id = auth.uid() OR is_admin())) OR is_super_admin()
  );

CREATE POLICY "Session owners and admins can delete"
  ON public.whatsapp_sessions FOR DELETE
  USING (
    (organization_id = get_user_organization_id()
    AND (owner_user_id = auth.uid() OR is_admin())) OR is_super_admin()
  );

-- WhatsApp Session Access
CREATE POLICY "Users can view access grants for accessible sessions"
  ON public.whatsapp_session_access FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM public.whatsapp_sessions 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

CREATE POLICY "Session owners and admins can manage access"
  ON public.whatsapp_session_access FOR ALL
  USING (
    session_id IN (
      SELECT id FROM public.whatsapp_sessions 
      WHERE organization_id = get_user_organization_id()
      AND (owner_user_id = auth.uid() OR is_admin())
    ) OR is_super_admin()
  );

-- WhatsApp Conversations
CREATE POLICY "Users can view conversations from accessible sessions"
  ON public.whatsapp_conversations FOR SELECT
  USING (
    (session_id IN (
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
    )) OR is_super_admin()
  );

CREATE POLICY "System can manage conversations"
  ON public.whatsapp_conversations FOR ALL
  USING (
    session_id IN (
      SELECT id FROM public.whatsapp_sessions 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

-- WhatsApp Messages
CREATE POLICY "Users can view messages from accessible sessions"
  ON public.whatsapp_messages FOR SELECT
  USING (
    (session_id IN (
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
    )) OR is_super_admin()
  );

CREATE POLICY "Users can send messages to accessible sessions"
  ON public.whatsapp_messages FOR INSERT
  WITH CHECK (
    (session_id IN (
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
    )) OR is_super_admin()
  );

CREATE POLICY "System can update message status"
  ON public.whatsapp_messages FOR UPDATE
  USING (
    session_id IN (
      SELECT id FROM public.whatsapp_sessions 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

-- WPP Tokens
CREATE POLICY "Users can view wpp tokens"
  ON public.wpp_tokens FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM public.whatsapp_sessions 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

CREATE POLICY "Admins can manage wpp tokens"
  ON public.wpp_tokens FOR ALL
  USING (
    (session_id IN (
      SELECT id FROM public.whatsapp_sessions 
      WHERE organization_id = get_user_organization_id()
    ) AND is_admin()) OR is_super_admin()
  );

-- Outbox Messages
CREATE POLICY "Users can view outbox messages"
  ON public.outbox_messages FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Users can manage outbox messages"
  ON public.outbox_messages FOR ALL
  USING (organization_id = get_user_organization_id() OR is_super_admin());

-- Media Jobs
CREATE POLICY "Users can view media jobs"
  ON public.media_jobs FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Users can manage media jobs"
  ON public.media_jobs FOR ALL
  USING (organization_id = get_user_organization_id() OR is_super_admin());

-- Contracts
CREATE POLICY "Users can view org contracts"
  ON public.contracts FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Users can manage contracts"
  ON public.contracts FOR ALL
  USING (organization_id = get_user_organization_id() OR is_super_admin());

-- Contract Brokers
CREATE POLICY "Users can view contract brokers"
  ON public.contract_brokers FOR SELECT
  USING (
    contract_id IN (
      SELECT id FROM public.contracts 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

CREATE POLICY "Users can manage contract brokers"
  ON public.contract_brokers FOR ALL
  USING (
    contract_id IN (
      SELECT id FROM public.contracts 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

-- Contract Sequences
CREATE POLICY "Users can view contract sequences"
  ON public.contract_sequences FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Users can manage contract sequences"
  ON public.contract_sequences FOR ALL
  USING (organization_id = get_user_organization_id() OR is_super_admin());

-- Financial Categories
CREATE POLICY "Users can view financial categories"
  ON public.financial_categories FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Users can manage financial categories"
  ON public.financial_categories FOR ALL
  USING (organization_id = get_user_organization_id() OR is_super_admin());

-- Financial Entries
CREATE POLICY "Users can view financial entries"
  ON public.financial_entries FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Users can manage financial entries"
  ON public.financial_entries FOR ALL
  USING (organization_id = get_user_organization_id() OR is_super_admin());

-- Commission Rules
CREATE POLICY "Users can view commission rules"
  ON public.commission_rules FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Admins can manage commission rules"
  ON public.commission_rules FOR ALL
  USING ((organization_id = get_user_organization_id() AND is_admin()) OR is_super_admin());

-- Commissions
CREATE POLICY "Users can view their commissions"
  ON public.commissions FOR SELECT
  USING (
    (organization_id = get_user_organization_id() 
    AND (user_id = auth.uid() OR is_admin())) 
    OR is_super_admin()
  );

CREATE POLICY "Admins can manage commissions"
  ON public.commissions FOR ALL
  USING ((organization_id = get_user_organization_id() AND is_admin()) OR is_super_admin());

-- Stage Automations
CREATE POLICY "Users can view stage automations"
  ON public.stage_automations FOR SELECT
  USING (
    stage_id IN (
      SELECT s.id FROM public.stages s
      JOIN public.pipelines p ON s.pipeline_id = p.id
      WHERE p.organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

CREATE POLICY "Admins can manage stage automations"
  ON public.stage_automations FOR ALL
  USING (
    (stage_id IN (
      SELECT s.id FROM public.stages s
      JOIN public.pipelines p ON s.pipeline_id = p.id
      WHERE p.organization_id = get_user_organization_id()
    ) AND is_admin()) OR is_super_admin()
  );

-- Automation Logs
CREATE POLICY "Users can view automation logs"
  ON public.automation_logs FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Users can create automation logs"
  ON public.automation_logs FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id() OR is_super_admin());

-- Automations
CREATE POLICY "Users can view automations"
  ON public.automations FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Admins can manage automations"
  ON public.automations FOR ALL
  USING ((organization_id = get_user_organization_id() AND is_admin()) OR is_super_admin());

-- Automation Nodes
CREATE POLICY "Users can view automation nodes"
  ON public.automation_nodes FOR SELECT
  USING (
    automation_id IN (
      SELECT id FROM public.automations 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

CREATE POLICY "Admins can manage automation nodes"
  ON public.automation_nodes FOR ALL
  USING (
    (automation_id IN (
      SELECT id FROM public.automations 
      WHERE organization_id = get_user_organization_id()
    ) AND is_admin()) OR is_super_admin()
  );

-- Automation Connections
CREATE POLICY "Users can view automation connections"
  ON public.automation_connections FOR SELECT
  USING (
    automation_id IN (
      SELECT id FROM public.automations 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

CREATE POLICY "Admins can manage automation connections"
  ON public.automation_connections FOR ALL
  USING (
    (automation_id IN (
      SELECT id FROM public.automations 
      WHERE organization_id = get_user_organization_id()
    ) AND is_admin()) OR is_super_admin()
  );

-- Automation Executions
CREATE POLICY "Users can view automation executions"
  ON public.automation_executions FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Admins can manage automation executions"
  ON public.automation_executions FOR ALL
  USING ((organization_id = get_user_organization_id() AND is_admin()) OR is_super_admin());

-- Automation Templates
CREATE POLICY "Users can view automation templates"
  ON public.automation_templates FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Admins can manage automation templates"
  ON public.automation_templates FOR ALL
  USING ((organization_id = get_user_organization_id() AND is_admin()) OR is_super_admin());

-- Audit Logs
CREATE POLICY "Users can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "System can create audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id() OR is_super_admin());

-- Telephony Calls
CREATE POLICY "Users can view telephony calls"
  ON public.telephony_calls FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Users can manage telephony calls"
  ON public.telephony_calls FOR ALL
  USING (organization_id = get_user_organization_id() OR is_super_admin());

-- Telephony Recording Audit
CREATE POLICY "Users can view recording audit"
  ON public.telephony_recording_audit FOR SELECT
  USING (
    call_id IN (
      SELECT id FROM public.telephony_calls 
      WHERE organization_id = get_user_organization_id()
    ) OR is_super_admin()
  );

CREATE POLICY "Users can create recording audit"
  ON public.telephony_recording_audit FOR INSERT
  WITH CHECK (user_id = auth.uid() OR is_super_admin());

-- System Settings
CREATE POLICY "Super admin can manage system settings"
  ON public.system_settings FOR ALL
  USING (is_super_admin());

CREATE POLICY "Users can view system settings"
  ON public.system_settings FOR SELECT
  USING (true);

-- Organization Modules
CREATE POLICY "Users can view org modules"
  ON public.organization_modules FOR SELECT
  USING (organization_id = get_user_organization_id() OR is_super_admin());

CREATE POLICY "Super admin can manage org modules"
  ON public.organization_modules FOR ALL
  USING (is_super_admin());

-- Super Admin Sessions
CREATE POLICY "Super admin can manage sessions"
  ON public.super_admin_sessions FOR ALL
  USING (is_super_admin());


-- ============================================
-- PARTE 8: STORAGE BUCKETS
-- ============================================

-- Criar buckets de storage
INSERT INTO storage.buckets (id, name, public) 
VALUES ('properties', 'properties', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('telephony-recordings', 'telephony-recordings', false)
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

-- Políticas de Storage: Avatars
CREATE POLICY "Avatars are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can upload avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update avatars"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete avatars"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');

-- Políticas de Storage: WhatsApp Media
CREATE POLICY "Public read access for whatsapp media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'whatsapp-media');

CREATE POLICY "Authenticated users can upload whatsapp media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'whatsapp-media');

CREATE POLICY "Service role can manage whatsapp media"
  ON storage.objects FOR ALL
  USING (bucket_id = 'whatsapp-media')
  WITH CHECK (bucket_id = 'whatsapp-media');

-- Políticas de Storage: Telephony Recordings (privado)
CREATE POLICY "Authenticated users can access telephony recordings"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'telephony-recordings' AND auth.role() = 'authenticated');

CREATE POLICY "System can upload telephony recordings"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'telephony-recordings');


-- ============================================
-- PARTE 9: REALTIME
-- ============================================

-- Habilitar Realtime para tabelas importantes
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_timeline_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.telephony_calls;


-- ============================================
-- PARTE 10: DADOS INICIAIS
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
  ('manage_integrations', 'Gerenciar integrações'),
  ('view_financial', 'Visualizar financeiro'),
  ('manage_financial', 'Gerenciar financeiro'),
  ('view_contracts', 'Visualizar contratos'),
  ('manage_contracts', 'Gerenciar contratos')
ON CONFLICT (key) DO NOTHING;


-- ============================================
-- FIM DO SCHEMA
-- ============================================
-- 
-- PRÓXIMOS PASSOS:
-- 
-- 1. Configure os SECRETS no Supabase (Settings > Edge Functions):
--    - EVOLUTION_API_URL (URL da API Evolution para WhatsApp)
--    - EVOLUTION_API_KEY (Chave da API Evolution)
--    - GOOGLE_CLIENT_ID (Client ID do Google para Calendar)
--    - GOOGLE_CLIENT_SECRET (Client Secret do Google)
--    - META_APP_ID (App ID do Meta para Facebook/Instagram Ads)
--    - META_APP_SECRET (App Secret do Meta)
--    - THREECPLUS_API_KEY (Chave da 3C Plus para Telefonia)
--
-- 2. Faça DEPLOY das Edge Functions via Supabase CLI:
--    supabase functions deploy evolution-proxy
--    supabase functions deploy evolution-webhook
--    supabase functions deploy wordpress-webhook
--    supabase functions deploy generic-webhook
--    supabase functions deploy meta-webhook
--    supabase functions deploy meta-oauth
--    supabase functions deploy google-calendar-auth
--    supabase functions deploy google-calendar-sync
--    supabase functions deploy message-sender
--    supabase functions deploy media-worker
--    supabase functions deploy automation-trigger
--    supabase functions deploy automation-executor
--    supabase functions deploy automation-runner
--    supabase functions deploy sla-checker
--    supabase functions deploy notification-scheduler
--    supabase functions deploy calculate-first-response
--    supabase functions deploy create-super-admin
--    supabase functions deploy create-organization-admin
--    supabase functions deploy create-user
--    supabase functions deploy delete-organization
--    supabase functions deploy telephony-recording-proxy
--    supabase functions deploy threecplus-webhook
--    supabase functions deploy session-health-check
--
-- 3. Configure o arquivo .env do frontend:
--    VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
--    VITE_SUPABASE_PUBLISHABLE_KEY=sua_anon_key
--    VITE_SUPABASE_PROJECT_ID=seu_project_id
--
-- ============================================
