-- Adicionar campo plan_code na tabela telecom_customers
ALTER TABLE public.telecom_customers 
ADD COLUMN IF NOT EXISTS plan_code VARCHAR(100);