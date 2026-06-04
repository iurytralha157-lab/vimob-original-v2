-- =====================================================
-- Phase 4-5: Localities System + Property Coordinates
-- =====================================================

-- 1. Create property_cities table
CREATE TABLE public.property_cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  uf TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, name, uf)
);

-- 2. Create property_neighborhoods table
CREATE TABLE public.property_neighborhoods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  city_id UUID REFERENCES property_cities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, city_id, name)
);

-- 3. Create property_condominiums table
CREATE TABLE public.property_condominiums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  city_id UUID REFERENCES property_cities(id) ON DELETE SET NULL,
  neighborhood_id UUID REFERENCES property_neighborhoods(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  address TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Add new columns to properties table
ALTER TABLE public.properties 
  ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES property_cities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS neighborhood_id UUID REFERENCES property_neighborhoods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS condominium_id UUID REFERENCES property_condominiums(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);

-- 5. Enable RLS on new tables
ALTER TABLE public.property_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_neighborhoods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_condominiums ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for property_cities
CREATE POLICY "Users can view their organization cities"
  ON public.property_cities FOR SELECT
  USING (
    organization_id = public.get_user_organization_id()
    OR public.is_super_admin()
  );

CREATE POLICY "Admins can manage their organization cities"
  ON public.property_cities FOR ALL
  USING (
    (organization_id = public.get_user_organization_id() AND public.is_admin())
    OR public.is_super_admin()
  );

-- 7. RLS Policies for property_neighborhoods
CREATE POLICY "Users can view their organization neighborhoods"
  ON public.property_neighborhoods FOR SELECT
  USING (
    organization_id = public.get_user_organization_id()
    OR public.is_super_admin()
  );

CREATE POLICY "Admins can manage their organization neighborhoods"
  ON public.property_neighborhoods FOR ALL
  USING (
    (organization_id = public.get_user_organization_id() AND public.is_admin())
    OR public.is_super_admin()
  );

-- 8. RLS Policies for property_condominiums
CREATE POLICY "Users can view their organization condominiums"
  ON public.property_condominiums FOR SELECT
  USING (
    organization_id = public.get_user_organization_id()
    OR public.is_super_admin()
  );

CREATE POLICY "Admins can manage their organization condominiums"
  ON public.property_condominiums FOR ALL
  USING (
    (organization_id = public.get_user_organization_id() AND public.is_admin())
    OR public.is_super_admin()
  );

-- 9. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_property_cities_org ON public.property_cities(organization_id);
CREATE INDEX IF NOT EXISTS idx_property_neighborhoods_org ON public.property_neighborhoods(organization_id);
CREATE INDEX IF NOT EXISTS idx_property_neighborhoods_city ON public.property_neighborhoods(city_id);
CREATE INDEX IF NOT EXISTS idx_property_condominiums_org ON public.property_condominiums(organization_id);
CREATE INDEX IF NOT EXISTS idx_property_condominiums_neighborhood ON public.property_condominiums(neighborhood_id);
CREATE INDEX IF NOT EXISTS idx_properties_city_id ON public.properties(city_id);
CREATE INDEX IF NOT EXISTS idx_properties_neighborhood_id ON public.properties(neighborhood_id);
CREATE INDEX IF NOT EXISTS idx_properties_condominium_id ON public.properties(condominium_id);
CREATE INDEX IF NOT EXISTS idx_properties_coordinates ON public.properties(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;