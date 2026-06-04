-- =====================================================
-- FASE 1: Tabela user_org_cache para evitar recursão RLS
-- =====================================================

-- Criar tabela de cache para org_id (evita loop em RLS de users)
CREATE TABLE IF NOT EXISTS public.user_org_cache (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now()
);

-- RLS simples sem dependência de outras tabelas
ALTER TABLE public.user_org_cache ENABLE ROW LEVEL SECURITY;

-- Super admin pode ver tudo
CREATE POLICY "Super admin full access" ON public.user_org_cache
FOR ALL USING (public.is_super_admin());

-- Usuário pode ver próprio cache
CREATE POLICY "User can view own cache" ON public.user_org_cache
FOR SELECT USING (user_id = auth.uid());

-- Trigger para sincronizar cache quando users muda
CREATE OR REPLACE FUNCTION public.sync_user_org_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Aplicar trigger em users
DROP TRIGGER IF EXISTS on_user_org_change ON public.users;
CREATE TRIGGER on_user_org_change
AFTER INSERT OR UPDATE OF organization_id ON public.users
FOR EACH ROW EXECUTE FUNCTION public.sync_user_org_cache();

-- Popular cache com dados existentes
INSERT INTO public.user_org_cache (user_id, organization_id, updated_at)
SELECT id, organization_id, now() FROM public.users
ON CONFLICT (user_id) DO UPDATE SET 
  organization_id = EXCLUDED.organization_id,
  updated_at = now();

-- =====================================================
-- FASE 2: Função auth_org_id() sem risco de loop
-- =====================================================

-- Substituir get_user_organization_id por versão segura
CREATE OR REPLACE FUNCTION public.auth_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.user_org_cache WHERE user_id = auth.uid()
$$;

-- Alias para compatibilidade
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_org_id()
$$;

-- =====================================================
-- FASE 3: Funções de verificação de papel unificadas
-- =====================================================

-- is_admin usando user_roles (fonte única de verdade)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'super_admin')
  )
$$;

-- is_org_admin - admin da organização específica
CREATE OR REPLACE FUNCTION public.is_org_admin(_org_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin') AND (
    _org_id IS NULL OR public.auth_org_id() = _org_id
  )
$$;

-- =====================================================
-- FASE 4: Trigger enforce_organization_id
-- =====================================================

CREATE OR REPLACE FUNCTION public.enforce_organization_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_org uuid;
  jwt_role text;
BEGIN
  -- Verificar se é service_role (webhooks, edge functions)
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
  
  -- Super admin pode especificar org_id
  IF public.is_super_admin() THEN
    IF NEW.organization_id IS NULL THEN
      RAISE EXCEPTION 'Super admin deve especificar organization_id';
    END IF;
    RETURN NEW;
  END IF;
  
  -- Usuários normais: força org_id do cache
  caller_org := public.auth_org_id();
  
  IF caller_org IS NULL THEN
    RAISE EXCEPTION 'Usuário não possui organização associada';
  END IF;
  
  -- Ignora org_id enviado pelo cliente, usa do servidor
  NEW.organization_id := caller_org;
  RETURN NEW;
END;
$$;

-- Aplicar trigger em tabelas principais
DROP TRIGGER IF EXISTS enforce_org_leads ON public.leads;
CREATE TRIGGER enforce_org_leads BEFORE INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_id();

DROP TRIGGER IF EXISTS enforce_org_properties ON public.properties;
CREATE TRIGGER enforce_org_properties BEFORE INSERT ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_id();

DROP TRIGGER IF EXISTS enforce_org_pipelines ON public.pipelines;
CREATE TRIGGER enforce_org_pipelines BEFORE INSERT ON public.pipelines
FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_id();

DROP TRIGGER IF EXISTS enforce_org_stages ON public.stages;
CREATE TRIGGER enforce_org_stages BEFORE INSERT ON public.stages
FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_id();

DROP TRIGGER IF EXISTS enforce_org_tags ON public.tags;
CREATE TRIGGER enforce_org_tags BEFORE INSERT ON public.tags
FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_id();

DROP TRIGGER IF EXISTS enforce_org_contracts ON public.contracts;
CREATE TRIGGER enforce_org_contracts BEFORE INSERT ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_id();

DROP TRIGGER IF EXISTS enforce_org_financial_entries ON public.financial_entries;
CREATE TRIGGER enforce_org_financial_entries BEFORE INSERT ON public.financial_entries
FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_id();

DROP TRIGGER IF EXISTS enforce_org_commissions ON public.commissions;
CREATE TRIGGER enforce_org_commissions BEFORE INSERT ON public.commissions
FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_id();

DROP TRIGGER IF EXISTS enforce_org_automations ON public.automations;
CREATE TRIGGER enforce_org_automations BEFORE INSERT ON public.automations
FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_id();

DROP TRIGGER IF EXISTS enforce_org_schedule_events ON public.schedule_events;
CREATE TRIGGER enforce_org_schedule_events BEFORE INSERT ON public.schedule_events
FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_id();

DROP TRIGGER IF EXISTS enforce_org_teams ON public.teams;
CREATE TRIGGER enforce_org_teams BEFORE INSERT ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_id();

DROP TRIGGER IF EXISTS enforce_org_round_robins ON public.round_robins;
CREATE TRIGGER enforce_org_round_robins BEFORE INSERT ON public.round_robins
FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_id();

DROP TRIGGER IF EXISTS enforce_org_whatsapp_sessions ON public.whatsapp_sessions;
CREATE TRIGGER enforce_org_whatsapp_sessions BEFORE INSERT ON public.whatsapp_sessions
FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_id();

DROP TRIGGER IF EXISTS enforce_org_notifications ON public.notifications;
CREATE TRIGGER enforce_org_notifications BEFORE INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_id();

DROP TRIGGER IF EXISTS enforce_org_cadence_templates ON public.cadence_templates;
CREATE TRIGGER enforce_org_cadence_templates BEFORE INSERT ON public.cadence_templates
FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_id();

DROP TRIGGER IF EXISTS enforce_org_automation_templates ON public.automation_templates;
CREATE TRIGGER enforce_org_automation_templates BEFORE INSERT ON public.automation_templates
FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_id();

DROP TRIGGER IF EXISTS enforce_org_financial_categories ON public.financial_categories;
CREATE TRIGGER enforce_org_financial_categories BEFORE INSERT ON public.financial_categories
FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_id();

DROP TRIGGER IF EXISTS enforce_org_commission_rules ON public.commission_rules;
CREATE TRIGGER enforce_org_commission_rules BEFORE INSERT ON public.commission_rules
FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_id();

-- =====================================================
-- FASE 5: RPC Segura para Invitations (sem enumeration)
-- =====================================================

-- Remover policy permissiva de SELECT
DROP POLICY IF EXISTS "Anyone can view invitation by token" ON public.invitations;

-- Criar RPC que retorna apenas 1 convite válido
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(_token text)
RETURNS TABLE (
  id uuid, 
  email text, 
  role public.app_role, 
  organization_id uuid, 
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT i.id, i.email, i.role, i.organization_id, i.expires_at
  FROM public.invitations i
  WHERE i.token = _token
  AND i.used_at IS NULL
  AND i.expires_at > now()
  LIMIT 1;
  
  -- Não retorna erro se não encontrar (evita enumeration)
END;
$$;

-- =====================================================
-- FASE 6: RPC Segura para Audit Logs (impedir falsificação)
-- =====================================================

-- Remover policy permissiva de INSERT
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;

-- Criar RPC server-side para logging
CREATE OR REPLACE FUNCTION public.log_audit(
  p_action text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_old_data jsonb DEFAULT NULL,
  p_new_data jsonb DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
  v_org_id uuid;
BEGIN
  -- Buscar org_id do usuário logado
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

-- =====================================================
-- FASE 7: Corrigir RLS de wpp_tokens (0 policies!)
-- =====================================================

-- wpp_tokens está vinculado a whatsapp_sessions
CREATE POLICY "Users can view org tokens" ON public.wpp_tokens
FOR SELECT USING (
  session_id IN (
    SELECT id FROM public.whatsapp_sessions 
    WHERE organization_id = public.auth_org_id()
  ) OR public.is_super_admin()
);

CREATE POLICY "Admins can manage org tokens" ON public.wpp_tokens
FOR ALL USING (
  public.is_admin() AND session_id IN (
    SELECT id FROM public.whatsapp_sessions 
    WHERE organization_id = public.auth_org_id()
  )
) WITH CHECK (
  public.is_admin() AND session_id IN (
    SELECT id FROM public.whatsapp_sessions 
    WHERE organization_id = public.auth_org_id()
  )
);

-- =====================================================
-- FASE 8: Função has_module para validar módulos
-- =====================================================

CREATE OR REPLACE FUNCTION public.has_module(_module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT is_enabled FROM public.organization_modules
      WHERE organization_id = public.auth_org_id()
      AND module_name = _module
    ),
    true  -- Se não existir registro, assume habilitado (default)
  ) OR public.is_super_admin()
$$;