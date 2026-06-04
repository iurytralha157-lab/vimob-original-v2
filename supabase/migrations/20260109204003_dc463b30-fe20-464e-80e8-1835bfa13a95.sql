
-- Categorias financeiras
CREATE TABLE public.financial_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Contratos
CREATE TABLE public.contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  contract_number TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('sale', 'rental', 'service')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  property_id UUID REFERENCES public.properties(id),
  lead_id UUID REFERENCES public.leads(id),
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  client_document TEXT,
  total_value NUMERIC NOT NULL DEFAULT 0,
  down_payment NUMERIC DEFAULT 0,
  installments INTEGER DEFAULT 1,
  payment_conditions TEXT,
  start_date DATE,
  end_date DATE,
  signing_date DATE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Corretores participantes do contrato
CREATE TABLE public.contract_brokers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  commission_percentage NUMERIC NOT NULL DEFAULT 0,
  commission_value NUMERIC,
  role TEXT DEFAULT 'broker',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Lançamentos financeiros (contas a pagar e receber)
CREATE TABLE public.financial_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('payable', 'receivable')),
  category_id UUID REFERENCES public.financial_categories(id),
  contract_id UUID REFERENCES public.contracts(id),
  property_id UUID REFERENCES public.properties(id),
  related_person_type TEXT CHECK (related_person_type IN ('client', 'broker', 'supplier')),
  related_person_id UUID,
  related_person_name TEXT,
  description TEXT NOT NULL,
  value NUMERIC NOT NULL,
  due_date DATE NOT NULL,
  competence_date DATE,
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  paid_at TIMESTAMP WITH TIME ZONE,
  paid_value NUMERIC,
  installment_number INTEGER DEFAULT 1,
  total_installments INTEGER DEFAULT 1,
  parent_entry_id UUID REFERENCES public.financial_entries(id),
  attachments JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Regras de comissão
CREATE TABLE public.commission_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  business_type TEXT NOT NULL CHECK (business_type IN ('sale', 'rental', 'service', 'all')),
  commission_type TEXT NOT NULL CHECK (commission_type IN ('percentage', 'fixed')),
  commission_value NUMERIC NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Comissões
CREATE TABLE public.commissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  contract_id UUID REFERENCES public.contracts(id),
  user_id UUID NOT NULL,
  property_id UUID REFERENCES public.properties(id),
  rule_id UUID REFERENCES public.commission_rules(id),
  base_value NUMERIC NOT NULL,
  percentage NUMERIC,
  calculated_value NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'forecast' CHECK (status IN ('forecast', 'approved', 'paid', 'cancelled')),
  forecast_date DATE,
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID,
  paid_at TIMESTAMP WITH TIME ZONE,
  paid_by UUID,
  payment_proof TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Sequência para número de contrato
CREATE TABLE public.contract_sequences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL UNIQUE,
  last_number INTEGER DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_sequences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for financial_categories
CREATE POLICY "Users can view org categories" ON public.financial_categories FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "Admins can manage categories" ON public.financial_categories FOR ALL USING (organization_id = get_user_organization_id() AND is_admin());

-- RLS Policies for contracts
CREATE POLICY "Users can view org contracts" ON public.contracts FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "Admins can manage contracts" ON public.contracts FOR ALL USING (organization_id = get_user_organization_id() AND is_admin());

-- RLS Policies for contract_brokers
CREATE POLICY "Users can view contract brokers" ON public.contract_brokers FOR SELECT USING (contract_id IN (SELECT id FROM contracts WHERE organization_id = get_user_organization_id()));
CREATE POLICY "Admins can manage contract brokers" ON public.contract_brokers FOR ALL USING (contract_id IN (SELECT id FROM contracts WHERE organization_id = get_user_organization_id()) AND is_admin());

-- RLS Policies for financial_entries
CREATE POLICY "Users can view org entries" ON public.financial_entries FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "Admins can manage entries" ON public.financial_entries FOR ALL USING (organization_id = get_user_organization_id() AND is_admin());

-- RLS Policies for commission_rules
CREATE POLICY "Users can view org rules" ON public.commission_rules FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "Admins can manage rules" ON public.commission_rules FOR ALL USING (organization_id = get_user_organization_id() AND is_admin());

-- RLS Policies for commissions
CREATE POLICY "Users can view org commissions" ON public.commissions FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY "Admins can manage commissions" ON public.commissions FOR ALL USING (organization_id = get_user_organization_id() AND is_admin());

-- RLS Policies for contract_sequences
CREATE POLICY "Users can manage sequences" ON public.contract_sequences FOR ALL USING (organization_id = get_user_organization_id());

-- Indexes
CREATE INDEX idx_contracts_org ON public.contracts(organization_id);
CREATE INDEX idx_contracts_status ON public.contracts(status);
CREATE INDEX idx_contracts_property ON public.contracts(property_id);
CREATE INDEX idx_financial_entries_org ON public.financial_entries(organization_id);
CREATE INDEX idx_financial_entries_due_date ON public.financial_entries(due_date);
CREATE INDEX idx_financial_entries_status ON public.financial_entries(status);
CREATE INDEX idx_financial_entries_type ON public.financial_entries(type);
CREATE INDEX idx_commissions_org ON public.commissions(organization_id);
CREATE INDEX idx_commissions_user ON public.commissions(user_id);
CREATE INDEX idx_commissions_status ON public.commissions(status);

-- Triggers for updated_at
CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_financial_entries_updated_at BEFORE UPDATE ON public.financial_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_commissions_updated_at BEFORE UPDATE ON public.commissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default categories
INSERT INTO public.financial_categories (organization_id, name, type) 
SELECT id, 'Comissão', 'expense' FROM organizations WHERE NOT EXISTS (SELECT 1 FROM financial_categories LIMIT 1)
UNION ALL
SELECT id, 'Taxa de administração', 'income' FROM organizations WHERE NOT EXISTS (SELECT 1 FROM financial_categories LIMIT 1)
UNION ALL
SELECT id, 'Marketing', 'expense' FROM organizations WHERE NOT EXISTS (SELECT 1 FROM financial_categories LIMIT 1)
UNION ALL
SELECT id, 'Manutenção', 'expense' FROM organizations WHERE NOT EXISTS (SELECT 1 FROM financial_categories LIMIT 1)
UNION ALL
SELECT id, 'Aluguel', 'income' FROM organizations WHERE NOT EXISTS (SELECT 1 FROM financial_categories LIMIT 1)
UNION ALL
SELECT id, 'Venda', 'income' FROM organizations WHERE NOT EXISTS (SELECT 1 FROM financial_categories LIMIT 1);
