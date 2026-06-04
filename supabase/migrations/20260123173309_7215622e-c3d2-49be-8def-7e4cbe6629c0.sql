-- =====================================================
-- SISTEMA DE FUNÇÕES/CARGOS CUSTOMIZÁVEIS POR ORGANIZAÇÃO
-- =====================================================

-- 1. Tabela de funções customizadas por organização
CREATE TABLE IF NOT EXISTS public.organization_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6B7280',
  is_system BOOLEAN DEFAULT false, -- Para funções padrão que não podem ser excluídas
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, name)
);

-- 2. Tabela de permissões disponíveis no sistema
CREATE TABLE IF NOT EXISTS public.available_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL, -- 'modules', 'leads', 'data', 'settings'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabela de permissões por função
CREATE TABLE IF NOT EXISTS public.organization_role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_role_id UUID NOT NULL REFERENCES public.organization_roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_role_id, permission_key)
);

-- 4. Tabela para atribuir função customizada aos usuários
CREATE TABLE IF NOT EXISTS public.user_organization_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_role_id UUID NOT NULL REFERENCES public.organization_roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- =====================================================
-- ÍNDICES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_org_roles_org ON public.organization_roles(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_role_perms_role ON public.organization_role_permissions(organization_role_id);
CREATE INDEX IF NOT EXISTS idx_user_org_roles_user ON public.user_organization_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_org_roles_role ON public.user_organization_roles(organization_role_id);

-- =====================================================
-- TRIGGERS PARA UPDATED_AT
-- =====================================================
CREATE TRIGGER update_organization_roles_updated_at
  BEFORE UPDATE ON public.organization_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- RLS POLICIES
-- =====================================================
ALTER TABLE public.organization_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.available_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_organization_roles ENABLE ROW LEVEL SECURITY;

-- Políticas para organization_roles
CREATE POLICY "Users can view their org roles"
  ON public.organization_roles FOR SELECT
  USING (organization_id = public.get_user_organization_id() OR public.is_super_admin());

CREATE POLICY "Admins can manage org roles"
  ON public.organization_roles FOR ALL
  USING (
    (organization_id = public.get_user_organization_id() AND public.is_admin())
    OR public.is_super_admin()
  );

-- Políticas para available_permissions (todos podem ler)
CREATE POLICY "Anyone can view available permissions"
  ON public.available_permissions FOR SELECT
  USING (true);

-- Políticas para organization_role_permissions
CREATE POLICY "Users can view their org role permissions"
  ON public.organization_role_permissions FOR SELECT
  USING (
    organization_role_id IN (
      SELECT id FROM public.organization_roles WHERE organization_id = public.get_user_organization_id()
    )
    OR public.is_super_admin()
  );

CREATE POLICY "Admins can manage org role permissions"
  ON public.organization_role_permissions FOR ALL
  USING (
    (
      organization_role_id IN (
        SELECT id FROM public.organization_roles WHERE organization_id = public.get_user_organization_id()
      )
      AND public.is_admin()
    )
    OR public.is_super_admin()
  );

-- Políticas para user_organization_roles
CREATE POLICY "Users can view their org user roles"
  ON public.user_organization_roles FOR SELECT
  USING (
    organization_role_id IN (
      SELECT id FROM public.organization_roles WHERE organization_id = public.get_user_organization_id()
    )
    OR public.is_super_admin()
  );

CREATE POLICY "Admins can manage user org roles"
  ON public.user_organization_roles FOR ALL
  USING (
    (
      organization_role_id IN (
        SELECT id FROM public.organization_roles WHERE organization_id = public.get_user_organization_id()
      )
      AND public.is_admin()
    )
    OR public.is_super_admin()
  );

-- =====================================================
-- PERMISSÕES DISPONÍVEIS NO SISTEMA
-- =====================================================
INSERT INTO public.available_permissions (key, name, description, category) VALUES
  -- Módulos
  ('module_crm', 'Acesso ao CRM', 'Visualizar e gerenciar leads e contatos', 'modules'),
  ('module_financial', 'Acesso ao Financeiro', 'Visualizar módulo financeiro', 'modules'),
  ('module_properties', 'Acesso a Imóveis', 'Visualizar catálogo de imóveis', 'modules'),
  ('module_agenda', 'Acesso à Agenda', 'Visualizar e gerenciar agenda', 'modules'),
  ('module_whatsapp', 'Acesso ao WhatsApp', 'Enviar e receber mensagens', 'modules'),
  ('module_reports', 'Acesso a Relatórios', 'Visualizar relatórios e dashboards', 'modules'),
  
  -- Ações em Leads
  ('lead_view_own', 'Ver próprios leads', 'Visualizar apenas leads atribuídos a si', 'leads'),
  ('lead_view_team', 'Ver leads da equipe', 'Visualizar leads de toda a equipe', 'leads'),
  ('lead_view_all', 'Ver todos os leads', 'Visualizar todos os leads da organização', 'leads'),
  ('lead_create', 'Criar leads', 'Criar novos leads manualmente', 'leads'),
  ('lead_edit_own', 'Editar próprios leads', 'Editar leads atribuídos a si', 'leads'),
  ('lead_edit_all', 'Editar todos os leads', 'Editar qualquer lead', 'leads'),
  ('lead_delete', 'Excluir leads', 'Excluir leads do sistema', 'leads'),
  ('lead_transfer', 'Transferir leads', 'Transferir leads entre usuários', 'leads'),
  ('lead_export', 'Exportar leads', 'Exportar lista de leads', 'leads'),
  
  -- Dados/Visualização
  ('data_view_dashboard', 'Ver Dashboard', 'Acesso ao painel principal', 'data'),
  ('data_view_team_stats', 'Ver estatísticas da equipe', 'Visualizar métricas de toda equipe', 'data'),
  ('data_view_org_stats', 'Ver estatísticas da organização', 'Visualizar métricas globais', 'data'),
  
  -- Configurações
  ('settings_users', 'Gerenciar usuários', 'Criar, editar e desativar usuários', 'settings'),
  ('settings_teams', 'Gerenciar equipes', 'Criar e configurar equipes', 'settings'),
  ('settings_pipelines', 'Gerenciar pipelines', 'Configurar pipelines e etapas', 'settings'),
  ('settings_integrations', 'Gerenciar integrações', 'Configurar WhatsApp, Meta, etc', 'settings'),
  ('settings_organization', 'Configurações da organização', 'Alterar dados da empresa', 'settings'),
  ('settings_roles', 'Gerenciar funções', 'Criar e editar funções/permissões', 'settings')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- FUNÇÃO PARA VERIFICAR PERMISSÃO
-- =====================================================
CREATE OR REPLACE FUNCTION public.user_has_permission(p_permission_key TEXT, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_role TEXT;
  v_has_permission BOOLEAN;
BEGIN
  -- Super admin tem todas as permissões
  IF public.is_super_admin() THEN
    RETURN TRUE;
  END IF;
  
  -- Verificar se é admin da organização (admin tem todas as permissões)
  SELECT role INTO v_user_role FROM public.users WHERE id = p_user_id;
  IF v_user_role = 'admin' THEN
    RETURN TRUE;
  END IF;
  
  -- Verificar permissão pela função customizada
  SELECT EXISTS (
    SELECT 1
    FROM public.user_organization_roles uor
    JOIN public.organization_role_permissions orp ON orp.organization_role_id = uor.organization_role_id
    WHERE uor.user_id = p_user_id
      AND orp.permission_key = p_permission_key
  ) INTO v_has_permission;
  
  RETURN COALESCE(v_has_permission, FALSE);
END;
$$;

-- =====================================================
-- FUNÇÃO PARA OBTER FUNÇÃO DO USUÁRIO
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_user_organization_role(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (
  role_id UUID,
  role_name TEXT,
  role_color TEXT,
  permissions TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id as role_id,
    r.name as role_name,
    r.color as role_color,
    ARRAY_AGG(orp.permission_key) as permissions
  FROM public.user_organization_roles uor
  JOIN public.organization_roles r ON r.id = uor.organization_role_id
  LEFT JOIN public.organization_role_permissions orp ON orp.organization_role_id = r.id
  WHERE uor.user_id = p_user_id
  GROUP BY r.id, r.name, r.color;
END;
$$;