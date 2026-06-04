-- Adicionar campo contracted_plan na tabela telecom_customers
-- Este campo armazena o nome do plano contratado exatamente como vem da planilha
-- e será usado para fazer match automático com a tabela service_plans pelo nome
ALTER TABLE public.telecom_customers 
ADD COLUMN IF NOT EXISTS contracted_plan VARCHAR(255);