-- Criar função para gerar stages padrão quando uma nova pipeline é criada
CREATE OR REPLACE FUNCTION public.create_default_stages_for_pipeline(pipeline_id uuid, org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stage_record RECORD;
  new_stage_id uuid;
  cadence_template_id uuid;
BEGIN
  -- Definir stages padrão imobiliários
  FOR stage_record IN 
    SELECT * FROM (VALUES
      (0, 'Base', 'base', '#6b7280'),
      (1, 'Contactados', 'contactados', '#3b82f6'),
      (2, 'Qualificados', 'qualificados', '#8b5cf6'),
      (3, 'Visita Agendada', 'visita_agendada', '#f59e0b'),
      (4, 'No-show', 'no_show', '#ef4444'),
      (5, 'Em Negociação', 'negociacao', '#10b981'),
      (6, 'Fechamento', 'fechamento', '#22c55e'),
      (7, 'Perdido', 'perdido', '#64748b')
    ) AS t(position, name, stage_key, color)
  LOOP
    -- Inserir stage
    INSERT INTO stages (pipeline_id, name, stage_key, position, color)
    VALUES (pipeline_id, stage_record.name, stage_record.stage_key, stage_record.position, stage_record.color)
    RETURNING id INTO new_stage_id;
    
    -- Criar cadence template para o stage
    INSERT INTO cadence_templates (stage_key, name, organization_id)
    VALUES (stage_record.stage_key, stage_record.name, org_id)
    ON CONFLICT (stage_key, organization_id) DO NOTHING
    RETURNING id INTO cadence_template_id;
    
    -- Se não retornou id, buscar o existente
    IF cadence_template_id IS NULL THEN
      SELECT id INTO cadence_template_id FROM cadence_templates 
      WHERE stage_key = stage_record.stage_key AND organization_id = org_id;
    END IF;
    
    -- Inserir tarefas de cadência apenas se o template foi criado agora (não tinha tarefas)
    IF NOT EXISTS (SELECT 1 FROM cadence_tasks_template WHERE cadence_template_id = cadence_template_id) THEN
      -- Cadências por stage
      CASE stage_record.stage_key
        WHEN 'base' THEN
          INSERT INTO cadence_tasks_template (cadence_template_id, day_offset, type, title, observation, position) VALUES
          (cadence_template_id, 0, 'note', 'Roteiro de Primeiro Contato', 
           'FAÇA A LIGAÇÃO RÁPIDA – ENTENDA O CLIENTE E MARQUE UM COMPROMISSO. 1) Abordagem animada 2) Crie conexão 3) Se apresente 4) Explique o motivo 5) Mostre postura consultiva', 0);
        
        WHEN 'contactados' THEN
          INSERT INTO cadence_tasks_template (cadence_template_id, day_offset, type, title, recommended_message, position) VALUES
          (cadence_template_id, 1, 'call', '1ª tentativa de contato', NULL, 0),
          (cadence_template_id, 1, 'message', '1.1 tentativa', 'Olá {nome}, tudo bem? Estou tentando falar com você para te apresentar as opções de imóveis que se encaixam no seu perfil. Assim que puder, me chama aqui que te explico tudo certinho.', 1),
          (cadence_template_id, 2, 'call', '2ª tentativa de contato', NULL, 2),
          (cadence_template_id, 4, 'call', '3ª tentativa de contato', NULL, 3),
          (cadence_template_id, 4, 'message', '3.1 tentativa', 'Olá {nome}, tudo bem? Estou tentando falar com você para te apresentar as opções de imóveis que se encaixam no seu perfil. Assim que puder, me chama aqui que te explico tudo certinho.', 4),
          (cadence_template_id, 4, 'message', '4.1 tentativa', 'Olá {nome}, tudo bem? Estou tentando falar com você para te apresentar as opções de imóveis que se encaixam no seu perfil. Assim que puder, me chama aqui que te explico tudo certinho.', 5),
          (cadence_template_id, 5, 'message', '5.1 tentativa (última)', 'Olá {nome}, tudo bem? Estou tentando falar com você para te apresentar as opções de imóveis que se encaixam no seu perfil. Assim que puder, me chama aqui que te explico tudo certinho.', 6);
        
        WHEN 'qualificados' THEN
          INSERT INTO cadence_tasks_template (cadence_template_id, day_offset, type, title, recommended_message, position) VALUES
          (cadence_template_id, 1, 'call', 'Follow-up de qualificação', NULL, 0),
          (cadence_template_id, 1, 'message', 'Inacessibilidade - Mensagem 1', 'Olá {nome}, tudo bem? Tentei falar com você para avançarmos na escolha do seu imóvel ideal. Me chama aqui assim que puder para alinharmos os próximos passos.', 1),
          (cadence_template_id, 2, 'call', 'Inacessibilidade - Ligação', NULL, 2),
          (cadence_template_id, 3, 'message', 'Inacessibilidade - Mensagem 2', 'Olá {nome}, tudo bem? Tentei falar com você para avançarmos na escolha do seu imóvel ideal. Me chama aqui assim que puder para alinharmos os próximos passos.', 3),
          (cadence_template_id, 4, 'note', 'Lembrete: Observação importante', NULL, 4);
        
        WHEN 'visita_agendada' THEN
          INSERT INTO cadence_tasks_template (cadence_template_id, day_offset, type, title, recommended_message, observation, position) VALUES
          (cadence_template_id, -1, 'message', 'Confirmação um dia antes', 'Bom dia {nome} 😊 Passando para confirmar nossa reunião de amanhã às {horário}. Separei um tempo especial para te apresentar boas oportunidades de imóveis. Estarei te esperando conforme combinamos. Até amanhã! 👍', NULL, 0),
          (cadence_template_id, 0, 'message', 'Confirmação no dia', 'Bom dia {nome} 😄 Está tudo pronto para nossa reunião de hoje às {horário}. Já separei algumas opções de imóveis que podem te interessar. Te espero conforme combinado!', NULL, 1),
          (cadence_template_id, 0, 'note', 'Estrutura da Reunião', NULL, '1. Introdução 2. Conscientização 3. Planejamento 4. Transição 5. Negociação', 2);
        
        WHEN 'no_show' THEN
          INSERT INTO cadence_tasks_template (cadence_template_id, day_offset, type, title, recommended_message, position) VALUES
          (cadence_template_id, 1, 'call', 'Tentativa de reagendamento', NULL, 0),
          (cadence_template_id, 1, 'message', 'Mensagem de reagendamento', 'Olá {nome}, tudo bem? Não conseguimos realizar a visita no horário marcado. Vamos reagendar para um novo dia que fique melhor para você?', 1),
          (cadence_template_id, 2, 'call', '2ª tentativa reagendamento', NULL, 2),
          (cadence_template_id, 2, 'call', '3ª tentativa reagendamento', NULL, 3),
          (cadence_template_id, 4, 'message', 'Mensagem final', '{nome}, tentei falar com você por ligação e WhatsApp. Vou aguardar seu retorno por até 24h para reagendarmos sua visita. Fico à disposição!', 4);
        
        WHEN 'negociacao' THEN
          INSERT INTO cadence_tasks_template (cadence_template_id, day_offset, type, title, observation, recommended_message, position) VALUES
          (cadence_template_id, 0, 'note', 'CTA - Provocar Proposta', 'Apresentar valores, criar opções de pagamento, personalizar condições. Não ter medo de propor cenários!', NULL, 0),
          (cadence_template_id, 1, 'message', 'Condições de pagamento', NULL, '{nome}, separei algumas condições de pagamento que podem facilitar sua compra. Vamos conversar para ajustar a melhor opção pra você?', 1);
        
        WHEN 'fechamento' THEN
          INSERT INTO cadence_tasks_template (cadence_template_id, day_offset, type, title, observation, position) VALUES
          (cadence_template_id, 0, 'note', 'CTA - Fechamento', 'Induzir decisão, identificar objeções, resolver restrições, acionar gerente se necessário', 0),
          (cadence_template_id, 0, 'note', 'Checklist interno', '1. Existe alguma objeção? 2. Existe algum ponto de restrição? 3. Qual a próxima etapa clara para o cliente?', 1);
        
        -- Perdido não tem cadências
        ELSE
          NULL;
      END CASE;
    END IF;
  END LOOP;
END;
$$;

-- Criar constraint única para cadence_templates (stage_key + organization_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cadence_templates_stage_key_org_unique'
  ) THEN
    ALTER TABLE cadence_templates 
    ADD CONSTRAINT cadence_templates_stage_key_org_unique UNIQUE (stage_key, organization_id);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;