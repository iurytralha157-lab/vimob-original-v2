-- Tabela de opções de características do imóvel (configuráveis)
CREATE TABLE public.property_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'geral',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, name)
);

-- Tabela de opções de proximidades (configuráveis)
CREATE TABLE public.property_proximities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, name)
);

-- Adicionar colunas na tabela properties para armazenar as seleções
ALTER TABLE public.properties 
  ADD COLUMN IF NOT EXISTS detalhes_extras JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS proximidades JSONB DEFAULT '[]'::jsonb;

-- Enable RLS
ALTER TABLE public.property_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_proximities ENABLE ROW LEVEL SECURITY;

-- RLS Policies para property_features
CREATE POLICY "Users can view property features from their organization"
  ON public.property_features FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can insert property features in their organization"
  ON public.property_features FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update property features in their organization"
  ON public.property_features FOR UPDATE
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete property features in their organization"
  ON public.property_features FOR DELETE
  USING (organization_id = public.get_user_organization_id());

-- RLS Policies para property_proximities
CREATE POLICY "Users can view property proximities from their organization"
  ON public.property_proximities FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can insert property proximities in their organization"
  ON public.property_proximities FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update property proximities in their organization"
  ON public.property_proximities FOR UPDATE
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete property proximities in their organization"
  ON public.property_proximities FOR DELETE
  USING (organization_id = public.get_user_organization_id());

-- Indexes para performance
CREATE INDEX idx_property_features_org ON public.property_features(organization_id);
CREATE INDEX idx_property_proximities_org ON public.property_proximities(organization_id);