
-- Novos campos para a tabela properties
ALTER TABLE public.properties
  -- Proprietário
  ADD COLUMN IF NOT EXISTS owner_name TEXT,
  ADD COLUMN IF NOT EXISTS owner_phone_residential TEXT,
  ADD COLUMN IF NOT EXISTS owner_phone_commercial TEXT,
  ADD COLUMN IF NOT EXISTS owner_cellphone TEXT,
  ADD COLUMN IF NOT EXISTS owner_email TEXT,
  ADD COLUMN IF NOT EXISTS owner_media_source TEXT,
  ADD COLUMN IF NOT EXISTS owner_notify_email BOOLEAN DEFAULT false,
  
  -- Estrutura
  ADD COLUMN IF NOT EXISTS finalidade TEXT DEFAULT 'Residencial',
  
  -- Localização
  ADD COLUMN IF NOT EXISTS pais TEXT DEFAULT 'Brasil',
  
  -- Características - Dados gerais
  ADD COLUMN IF NOT EXISTS cadastrado_por TEXT,
  ADD COLUMN IF NOT EXISTS referencia_alternativa TEXT,
  ADD COLUMN IF NOT EXISTS condicao_pagamento TEXT,
  ADD COLUMN IF NOT EXISTS valor_itr NUMERIC,
  ADD COLUMN IF NOT EXISTS valor_seguro_fianca NUMERIC,
  
  -- Características - Detalhes do imóvel
  ADD COLUMN IF NOT EXISTS padrao TEXT,
  ADD COLUMN IF NOT EXISTS posicao_localizacao TEXT,
  ADD COLUMN IF NOT EXISTS situacao_imovel TEXT,
  ADD COLUMN IF NOT EXISTS ocupacao TEXT,
  ADD COLUMN IF NOT EXISTS autorizado_comercializacao BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS exclusividade BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ano_reforma INTEGER,
  
  -- Características - Extras
  ADD COLUMN IF NOT EXISTS usou_fgts BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS aceita_financiamento BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS zoneamento TEXT,
  ADD COLUMN IF NOT EXISTS valor_venda_avaliado NUMERIC,
  ADD COLUMN IF NOT EXISTS valor_locacao_avaliado NUMERIC,
  ADD COLUMN IF NOT EXISTS comentarios_internos TEXT,
  ADD COLUMN IF NOT EXISTS marcadores TEXT[],
  
  -- Controle de Chaves
  ADD COLUMN IF NOT EXISTS local_chaves TEXT,
  
  -- Publicação na Web
  ADD COLUMN IF NOT EXISTS anunciar BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS super_destaque BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tour_virtual TEXT,
  ADD COLUMN IF NOT EXISTS descricao_site TEXT,
  
  -- Placas e Faixas
  ADD COLUMN IF NOT EXISTS placa_no_local BOOLEAN DEFAULT false,
  
  -- Comissões e Condições
  ADD COLUMN IF NOT EXISTS tipo_comissao TEXT,
  ADD COLUMN IF NOT EXISTS corretor_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS comissao_venda NUMERIC,
  ADD COLUMN IF NOT EXISTS comissao_locacao NUMERIC,
  ADD COLUMN IF NOT EXISTS data_inicio_comissao DATE,
  ADD COLUMN IF NOT EXISTS condicao_comercial TEXT,
  
  -- Confidencial
  ADD COLUMN IF NOT EXISTS codigo_iptu TEXT,
  ADD COLUMN IF NOT EXISTS numero_matricula TEXT,
  ADD COLUMN IF NOT EXISTS codigo_eletricidade TEXT,
  ADD COLUMN IF NOT EXISTS codigo_agua TEXT,
  ADD COLUMN IF NOT EXISTS status_descritivo TEXT,
  ADD COLUMN IF NOT EXISTS aprovacao_ambiental TEXT,
  ADD COLUMN IF NOT EXISTS projeto_aprovado BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS observacoes_documentacao TEXT,
  
  -- Arquivos
  ADD COLUMN IF NOT EXISTS arquivos JSONB DEFAULT '[]'::jsonb;
