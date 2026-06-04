-- =============================================
-- CORREÇÃO COMPLETA DO MÓDULO FINANCEIRO
-- =============================================

-- 1. TABELA CONTRACTS - Adicionar colunas faltantes
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS client_email text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS client_phone text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS client_document text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS down_payment numeric DEFAULT 0;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS installments integer DEFAULT 1;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS payment_conditions text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS end_date date;

-- 2. TABELA FINANCIAL_ENTRIES - Adicionar paid_value
ALTER TABLE public.financial_entries ADD COLUMN IF NOT EXISTS paid_value numeric;

-- 3. TABELA COMMISSIONS - Adicionar colunas faltantes
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS base_value numeric DEFAULT 0;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS calculated_value numeric DEFAULT 0;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS forecast_date date;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS payment_proof text;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS rule_id uuid REFERENCES public.commission_rules(id) ON DELETE SET NULL;

-- 4. Índices para performance
CREATE INDEX IF NOT EXISTS idx_contracts_client_name ON public.contracts(client_name);
CREATE INDEX IF NOT EXISTS idx_commissions_contract_id ON public.commissions(contract_id);
CREATE INDEX IF NOT EXISTS idx_commissions_property_id ON public.commissions(property_id);
CREATE INDEX IF NOT EXISTS idx_financial_entries_paid_date ON public.financial_entries(paid_date);