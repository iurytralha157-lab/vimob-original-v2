-- Adicionar novos campos na tabela telecom_customers
ALTER TABLE public.telecom_customers 
ADD COLUMN IF NOT EXISTS contract_date DATE,
ADD COLUMN IF NOT EXISTS chip_category VARCHAR(50),
ADD COLUMN IF NOT EXISTS chip_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS mesh_repeater VARCHAR(50),
ADD COLUMN IF NOT EXISTS mesh_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_combo BOOLEAN DEFAULT FALSE;

-- Criar tabela para controle de cobranças mensais
CREATE TABLE IF NOT EXISTS public.telecom_billing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.telecom_customers(id) ON DELETE CASCADE,
  billing_month DATE NOT NULL,
  billing_status VARCHAR(50) DEFAULT 'NAO_COBRADO',
  payment_status VARCHAR(50) DEFAULT 'PENDENTE',
  amount DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, billing_month)
);

-- Habilitar RLS
ALTER TABLE public.telecom_billing ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para telecom_billing
CREATE POLICY "Users can view billing from their organization"
ON public.telecom_billing FOR SELECT
USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can insert billing in their organization"
ON public.telecom_billing FOR INSERT
WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update billing in their organization"
ON public.telecom_billing FOR UPDATE
USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete billing in their organization"
ON public.telecom_billing FOR DELETE
USING (organization_id = public.get_user_organization_id());

-- Trigger para updated_at
CREATE TRIGGER update_telecom_billing_updated_at
BEFORE UPDATE ON public.telecom_billing
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_telecom_billing_customer ON public.telecom_billing(customer_id);
CREATE INDEX IF NOT EXISTS idx_telecom_billing_month ON public.telecom_billing(billing_month);
CREATE INDEX IF NOT EXISTS idx_telecom_billing_org ON public.telecom_billing(organization_id);

-- Comentários
COMMENT ON COLUMN public.telecom_customers.contract_date IS 'Data de contratação do serviço';
COMMENT ON COLUMN public.telecom_customers.chip_category IS 'Categoria do chip: CONVENCIONAL, PROMOCIONAL, SEM_CHIP';
COMMENT ON COLUMN public.telecom_customers.chip_quantity IS 'Quantidade de chips';
COMMENT ON COLUMN public.telecom_customers.mesh_repeater IS 'Tipo de repetidor: NO_ATO, NORMAL, SEM_REPETIDOR';
COMMENT ON COLUMN public.telecom_customers.mesh_quantity IS 'Quantidade de repetidores mesh';
COMMENT ON COLUMN public.telecom_customers.is_combo IS 'Se o cliente tem combo de serviços';