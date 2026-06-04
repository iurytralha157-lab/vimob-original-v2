-- Adicionar colunas de dados fiscais e de contato na tabela organizations
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS cnpj text,
ADD COLUMN IF NOT EXISTS inscricao_estadual text,
ADD COLUMN IF NOT EXISTS razao_social text,
ADD COLUMN IF NOT EXISTS nome_fantasia text,
ADD COLUMN IF NOT EXISTS cep text,
ADD COLUMN IF NOT EXISTS endereco text,
ADD COLUMN IF NOT EXISTS numero text,
ADD COLUMN IF NOT EXISTS complemento text,
ADD COLUMN IF NOT EXISTS bairro text,
ADD COLUMN IF NOT EXISTS cidade text,
ADD COLUMN IF NOT EXISTS uf text,
ADD COLUMN IF NOT EXISTS telefone text,
ADD COLUMN IF NOT EXISTS whatsapp text,
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS website text;