-- ================================================
-- FASE 1B: Tabelas e funções para SaaS Multi-Tenant
-- ================================================

-- 1. Adicionar novos campos em organizations para controle SaaS
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS admin_notes TEXT,
ADD COLUMN IF NOT EXISTS last_access_at TIMESTAMPTZ;

-- 2. Criar tabela de controle de módulos por organização
CREATE TABLE IF NOT EXISTS public.organization_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  module_name TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, module_name)
);

-- 3. Criar tabela de sessões de impersonate (super admin entrando como outro usuário)
CREATE TABLE IF NOT EXISTS public.super_admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id UUID NOT NULL,
  impersonating_org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

-- 4. Habilitar RLS nas novas tabelas
ALTER TABLE public.organization_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admin_sessions ENABLE ROW LEVEL SECURITY;

-- 5. Função para verificar se usuário é super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
$$;

-- 6. Índices para performance
CREATE INDEX IF NOT EXISTS idx_organization_modules_org_id ON public.organization_modules(organization_id);
CREATE INDEX IF NOT EXISTS idx_super_admin_sessions_admin_id ON public.super_admin_sessions(super_admin_id);
CREATE INDEX IF NOT EXISTS idx_super_admin_sessions_active ON public.super_admin_sessions(is_active) WHERE is_active = true;