-- =============================================
-- MIGRATION: Meta Lead Ads Integration
-- =============================================

-- 1. Adicionar colunas na tabela leads
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS meta_lead_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_form_id TEXT;

-- Index para evitar leads duplicados
CREATE INDEX IF NOT EXISTS idx_leads_meta_lead_id 
  ON public.leads(meta_lead_id) 
  WHERE meta_lead_id IS NOT NULL;

-- 2. Adicionar colunas na tabela meta_integrations
ALTER TABLE public.meta_integrations 
  ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_status TEXT DEFAULT 'novo',
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS leads_received INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_lead_at TIMESTAMPTZ;

-- Constraint unique para upsert funcionar
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'meta_integrations_org_page_unique'
  ) THEN
    ALTER TABLE public.meta_integrations 
      ADD CONSTRAINT meta_integrations_org_page_unique 
      UNIQUE (organization_id, page_id);
  END IF;
EXCEPTION WHEN others THEN
  NULL; -- Ignore se já existir
END $$;

-- 3. Criar tabela meta_form_configs
CREATE TABLE IF NOT EXISTS public.meta_form_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES meta_integrations(id) ON DELETE CASCADE,
  form_id TEXT NOT NULL,
  form_name TEXT,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES stages(id) ON DELETE SET NULL,
  default_status TEXT DEFAULT 'novo',
  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  auto_tags JSONB DEFAULT '[]',
  field_mapping JSONB DEFAULT '{}',
  custom_fields_config JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  leads_received INTEGER DEFAULT 0,
  last_lead_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Constraint unique para form_id por organização
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'meta_form_configs_org_form_unique'
  ) THEN
    ALTER TABLE public.meta_form_configs 
      ADD CONSTRAINT meta_form_configs_org_form_unique 
      UNIQUE (organization_id, form_id);
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- 4. RLS para meta_form_configs
ALTER TABLE public.meta_form_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own org form configs" ON public.meta_form_configs;
CREATE POLICY "Users can view own org form configs"
  ON public.meta_form_configs FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can insert form configs" ON public.meta_form_configs;
CREATE POLICY "Admins can insert form configs"
  ON public.meta_form_configs FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update form configs" ON public.meta_form_configs;
CREATE POLICY "Admins can update form configs"
  ON public.meta_form_configs FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete form configs" ON public.meta_form_configs;
CREATE POLICY "Admins can delete form configs"
  ON public.meta_form_configs FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 5. Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_meta_form_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_meta_form_configs_updated_at ON public.meta_form_configs;
CREATE TRIGGER update_meta_form_configs_updated_at
  BEFORE UPDATE ON public.meta_form_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_meta_form_configs_updated_at();