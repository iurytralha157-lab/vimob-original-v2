-- Adicionar novos campos para qualificação de leads
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS renda_familiar text,
ADD COLUMN IF NOT EXISTS trabalha boolean,
ADD COLUMN IF NOT EXISTS profissao text,
ADD COLUMN IF NOT EXISTS faixa_valor_imovel text,
ADD COLUMN IF NOT EXISTS finalidade_compra text,
ADD COLUMN IF NOT EXISTS procura_financiamento boolean;