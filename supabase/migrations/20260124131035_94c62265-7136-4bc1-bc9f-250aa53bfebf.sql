-- Adicionar novos campos à tabela telecom_customers
ALTER TABLE public.telecom_customers
ADD COLUMN IF NOT EXISTS rg TEXT,
ADD COLUMN IF NOT EXISTS birth_date DATE,
ADD COLUMN IF NOT EXISTS phone2 TEXT,
ADD COLUMN IF NOT EXISTS mother_name TEXT,
ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Comentários para documentação
COMMENT ON COLUMN public.telecom_customers.rg IS 'Número do RG do cliente';
COMMENT ON COLUMN public.telecom_customers.birth_date IS 'Data de nascimento do cliente';
COMMENT ON COLUMN public.telecom_customers.phone2 IS 'Telefone secundário do cliente';
COMMENT ON COLUMN public.telecom_customers.mother_name IS 'Nome da mãe do cliente';
COMMENT ON COLUMN public.telecom_customers.payment_method IS 'Método de pagamento: credit_card, debit_card, pix_auto, boleto_pix';