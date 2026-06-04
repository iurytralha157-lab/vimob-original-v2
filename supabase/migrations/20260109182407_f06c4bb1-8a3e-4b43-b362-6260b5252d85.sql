-- Adicionar novos valores ao enum lead_source
ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'facebook';
ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'instagram';
ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'import';
ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'google';
ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'indicacao';
ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'whatsapp';
ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'outros';

-- Adicionar novos campos na tabela leads
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS cargo TEXT,
ADD COLUMN IF NOT EXISTS empresa TEXT,
ADD COLUMN IF NOT EXISTS endereco TEXT,
ADD COLUMN IF NOT EXISTS numero TEXT,
ADD COLUMN IF NOT EXISTS complemento TEXT,
ADD COLUMN IF NOT EXISTS bairro TEXT,
ADD COLUMN IF NOT EXISTS cidade TEXT,
ADD COLUMN IF NOT EXISTS uf TEXT,
ADD COLUMN IF NOT EXISTS cep TEXT,
ADD COLUMN IF NOT EXISTS valor_interesse DECIMAL(15,2);

-- Criar índice para busca por empresa
CREATE INDEX IF NOT EXISTS idx_leads_empresa ON public.leads(empresa);

-- Criar índice para busca por cidade
CREATE INDEX IF NOT EXISTS idx_leads_cidade ON public.leads(cidade);