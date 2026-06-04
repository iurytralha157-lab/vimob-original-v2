-- ===========================================
-- SISTEMA MULTI-SEGMENTO: Telecom + Imobiliária
-- ===========================================

-- 1. Adicionar segment na organizations
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS segment VARCHAR(50) DEFAULT 'imobiliario';

-- 2. Tabela de Áreas de Cobertura
CREATE TABLE IF NOT EXISTS coverage_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uf VARCHAR(2) NOT NULL,
  city VARCHAR(100) NOT NULL,
  neighborhood VARCHAR(100) NOT NULL,
  zone VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, uf, city, neighborhood)
);

-- 3. Tabela de Planos de Serviço
CREATE TABLE IF NOT EXISTS service_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL,
  name TEXT NOT NULL,
  category VARCHAR(20) NOT NULL CHECK (category IN ('PF', 'PJ', 'MOVEL', 'ADICIONAL')),
  price NUMERIC(10,2),
  speed_mb INTEGER,
  description TEXT,
  features TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  is_promo BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, code)
);

-- 4. Tabela de Clientes Telecom
CREATE TABLE IF NOT EXISTS telecom_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  external_id VARCHAR(50),
  name TEXT NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  cpf_cnpj VARCHAR(20),
  address TEXT,
  number VARCHAR(20),
  complement VARCHAR(100),
  neighborhood VARCHAR(100),
  city VARCHAR(100),
  uf VARCHAR(2),
  cep VARCHAR(10),
  plan_id UUID REFERENCES service_plans(id),
  plan_value NUMERIC(10,2),
  due_day INTEGER,
  seller_id UUID REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'NOVO',
  installation_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Índices
CREATE INDEX IF NOT EXISTS idx_coverage_areas_org ON coverage_areas(organization_id);
CREATE INDEX IF NOT EXISTS idx_coverage_areas_uf_city ON coverage_areas(organization_id, uf, city);
CREATE INDEX IF NOT EXISTS idx_service_plans_org ON service_plans(organization_id);
CREATE INDEX IF NOT EXISTS idx_service_plans_category ON service_plans(organization_id, category);
CREATE INDEX IF NOT EXISTS idx_telecom_customers_org ON telecom_customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_telecom_customers_status ON telecom_customers(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_telecom_customers_plan ON telecom_customers(plan_id);

-- 6. RLS
ALTER TABLE coverage_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE telecom_customers ENABLE ROW LEVEL SECURITY;

-- Políticas coverage_areas
CREATE POLICY "Users can view coverage from their org"
  ON coverage_areas FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Admins can insert coverage"
  ON coverage_areas FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id() AND is_admin());

CREATE POLICY "Admins can update coverage"
  ON coverage_areas FOR UPDATE
  USING (organization_id = get_user_organization_id() AND is_admin());

CREATE POLICY "Admins can delete coverage"
  ON coverage_areas FOR DELETE
  USING (organization_id = get_user_organization_id() AND is_admin());

-- Políticas service_plans
CREATE POLICY "Users can view plans from their org"
  ON service_plans FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Admins can insert plans"
  ON service_plans FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id() AND is_admin());

CREATE POLICY "Admins can update plans"
  ON service_plans FOR UPDATE
  USING (organization_id = get_user_organization_id() AND is_admin());

CREATE POLICY "Admins can delete plans"
  ON service_plans FOR DELETE
  USING (organization_id = get_user_organization_id() AND is_admin());

-- Políticas telecom_customers
CREATE POLICY "Users can view customers from their org"
  ON telecom_customers FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Users can insert customers"
  ON telecom_customers FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Users can update customers from their org"
  ON telecom_customers FOR UPDATE
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Admins can delete customers"
  ON telecom_customers FOR DELETE
  USING (organization_id = get_user_organization_id() AND is_admin());

-- Super admin override
CREATE POLICY "Super admin full access coverage" ON coverage_areas FOR ALL USING (is_super_admin());
CREATE POLICY "Super admin full access plans" ON service_plans FOR ALL USING (is_super_admin());
CREATE POLICY "Super admin full access customers" ON telecom_customers FOR ALL USING (is_super_admin());

-- 7. Triggers updated_at
CREATE TRIGGER update_coverage_areas_updated_at
  BEFORE UPDATE ON coverage_areas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_service_plans_updated_at
  BEFORE UPDATE ON service_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_telecom_customers_updated_at
  BEFORE UPDATE ON telecom_customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();