-- =============================================
-- FASE 1: Sistema de Planos SaaS
-- =============================================

-- Tabela de planos de assinatura
CREATE TABLE public.admin_subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  billing_cycle TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
  trial_days INTEGER DEFAULT 7,
  max_users INTEGER DEFAULT 10,
  max_leads INTEGER,
  modules TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.admin_subscription_plans ENABLE ROW LEVEL SECURITY;

-- Super admins can manage plans
CREATE POLICY "Super admins can manage plans"
  ON public.admin_subscription_plans
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = auth.uid() 
      AND users.role = 'super_admin'
    )
  );

-- All authenticated users can read active plans
CREATE POLICY "Authenticated users can read active plans"
  ON public.admin_subscription_plans
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- =============================================
-- Alterações na tabela organizations
-- =============================================

-- Adicionar campos de plano e trial
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.admin_subscription_plans(id),
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_type TEXT DEFAULT 'trial' CHECK (subscription_type IN ('trial', 'paid', 'free'));

-- =============================================
-- FASE 4: Comunicados Avançados
-- =============================================

-- Adicionar campos para targeting e display options
ALTER TABLE public.announcements
ADD COLUMN IF NOT EXISTS show_banner BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS send_notification BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS target_type TEXT DEFAULT 'all' CHECK (target_type IN ('all', 'organizations', 'admins', 'specific')),
ADD COLUMN IF NOT EXISTS target_organization_ids UUID[],
ADD COLUMN IF NOT EXISTS target_user_ids UUID[];

-- =============================================
-- FASE 5: Central de Ajuda Editável
-- =============================================

-- Tabela de artigos de ajuda
CREATE TABLE public.help_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  video_url TEXT,
  image_url TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.help_articles ENABLE ROW LEVEL SECURITY;

-- Super admins can manage help articles
CREATE POLICY "Super admins can manage help articles"
  ON public.help_articles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = auth.uid() 
      AND users.role = 'super_admin'
    )
  );

-- All authenticated users can read active articles
CREATE POLICY "Authenticated users can read active articles"
  ON public.help_articles
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- =============================================
-- Trigger para updated_at
-- =============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para admin_subscription_plans
DROP TRIGGER IF EXISTS update_admin_subscription_plans_updated_at ON public.admin_subscription_plans;
CREATE TRIGGER update_admin_subscription_plans_updated_at
  BEFORE UPDATE ON public.admin_subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para help_articles
DROP TRIGGER IF EXISTS update_help_articles_updated_at ON public.help_articles;
CREATE TRIGGER update_help_articles_updated_at
  BEFORE UPDATE ON public.help_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- Inserir planos padrão
-- =============================================

INSERT INTO public.admin_subscription_plans (name, description, price, trial_days, max_users, modules) VALUES
  ('Trial', 'Período de teste de 7 dias', 0, 7, 5, ARRAY['dashboard', 'leads', 'contacts']),
  ('Básico', 'Para pequenas equipes', 99, 0, 5, ARRAY['dashboard', 'leads', 'contacts', 'pipelines']),
  ('Profissional', 'Para equipes em crescimento', 199, 0, 15, ARRAY['dashboard', 'leads', 'contacts', 'pipelines', 'automations', 'whatsapp']),
  ('Enterprise', 'Para grandes operações', 399, 0, 50, ARRAY['dashboard', 'leads', 'contacts', 'pipelines', 'automations', 'whatsapp', 'financial', 'properties'])
ON CONFLICT DO NOTHING;