-- Função para criar stages e cadências padrão para uma pipeline
CREATE OR REPLACE FUNCTION create_default_stages_for_pipeline(
  p_pipeline_id UUID,
  p_org_id UUID
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage_id UUID;
  v_cadence_id UUID;
BEGIN
  -- ========================================
  -- 1. BASE (Primeiro Contato) - Azul
  -- ========================================
  INSERT INTO stages (pipeline_id, name, stage_key, color, position)
  VALUES (p_pipeline_id, 'Base', 'base', '#3B82F6', 1)
  RETURNING id INTO v_stage_id;
  
  INSERT INTO cadence_templates (organization_id, stage_key, name)
  VALUES (p_org_id, 'base', 'Cadência Base')
  RETURNING id INTO v_cadence_id;
  
  INSERT INTO cadence_tasks_template (cadence_template_id, position, day_offset, type, title, description, observation, recommended_message) VALUES
  (v_cadence_id, 1, 0, 'call', 'Primeiro Contato', 'Ligar para o lead e entender suas necessidades', 'Roteiro: Abordagem animada, perguntas de necessidade, expectativa e dor. CTA: Agendar visita/reunião', NULL);

  -- ========================================
  -- 2. CONTACTADOS - Cinza
  -- ========================================
  INSERT INTO stages (pipeline_id, name, stage_key, color, position)
  VALUES (p_pipeline_id, 'Contactados', 'contactados', '#6B7280', 2)
  RETURNING id INTO v_stage_id;
  
  INSERT INTO cadence_templates (organization_id, stage_key, name)
  VALUES (p_org_id, 'contactados', 'Cadência Contactados')
  RETURNING id INTO v_cadence_id;
  
  INSERT INTO cadence_tasks_template (cadence_template_id, position, day_offset, type, title, description, observation, recommended_message) VALUES
  (v_cadence_id, 1, 0, 'call', '1ª tentativa de contato', 'Primeira ligação para o lead', NULL, NULL),
  (v_cadence_id, 2, 0, 'message', '1.1 tentativa (mensagem)', 'Mensagem após tentativa de ligação', NULL, 'Olá {nome}, estou tentando falar com você para te apresentar as opções de imóveis que separei especialmente para seu perfil. Podemos conversar agora?'),
  (v_cadence_id, 3, 1, 'call', '2ª tentativa de contato', 'Segunda ligação para o lead', NULL, NULL),
  (v_cadence_id, 4, 3, 'call', '3ª tentativa de contato', 'Terceira ligação para o lead', NULL, NULL),
  (v_cadence_id, 5, 3, 'message', '3.1 tentativa (mensagem)', 'Mensagem de follow-up', NULL, 'Olá {nome}, estou tentando falar com você. Separei algumas opções incríveis de imóveis! Qual o melhor horário para conversarmos?'),
  (v_cadence_id, 6, 3, 'message', '4.1 tentativa (mensagem)', 'Mensagem de reforço', NULL, 'Olá {nome}, vi que você demonstrou interesse em imóveis. Tenho algumas oportunidades que podem te interessar! Posso te ligar?'),
  (v_cadence_id, 7, 4, 'message', '5.1 tentativa final', 'Última tentativa antes de desqualificar', NULL, 'Olá {nome}, essa é minha última tentativa de contato. Se ainda tiver interesse em encontrar o imóvel ideal, me responda aqui!');

  -- ========================================
  -- 3. QUALIFICADOS - Amarelo
  -- ========================================
  INSERT INTO stages (pipeline_id, name, stage_key, color, position)
  VALUES (p_pipeline_id, 'Qualificados', 'qualificados', '#F59E0B', 3)
  RETURNING id INTO v_stage_id;
  
  INSERT INTO cadence_templates (organization_id, stage_key, name)
  VALUES (p_org_id, 'qualificados', 'Cadência Qualificados')
  RETURNING id INTO v_cadence_id;
  
  INSERT INTO cadence_tasks_template (cadence_template_id, position, day_offset, type, title, description, observation, recommended_message) VALUES
  (v_cadence_id, 1, 0, 'call', 'Follow-up de qualificação', 'Ligar para avançar na qualificação', NULL, NULL),
  (v_cadence_id, 2, 0, 'message', 'Mensagem pós-qualificação', 'Enviar opções de imóveis', NULL, 'Olá {nome}, tentei falar com você para avançarmos na escolha do seu imóvel ideal. Separei algumas opções que combinam com o que conversamos!'),
  (v_cadence_id, 3, 1, 'call', 'Tentativa de inacessibilidade', 'Segunda tentativa de contato', NULL, NULL),
  (v_cadence_id, 4, 2, 'message', 'Mensagem de inacessibilidade', 'Tentar reengajar o lead', NULL, 'Olá {nome}, tentei falar com você algumas vezes. Estou à disposição para te ajudar a encontrar o imóvel perfeito. Me avise quando puder conversar!'),
  (v_cadence_id, 5, 3, 'note', 'Lembrete importante', 'Avaliar se o lead continua qualificado', 'Verificar se o lead respondeu às tentativas. Avaliar se deve ser movido para Perdido ou continuar nurturing.', NULL);

  -- ========================================
  -- 4. VISITA AGENDADA - Roxo
  -- ========================================
  INSERT INTO stages (pipeline_id, name, stage_key, color, position)
  VALUES (p_pipeline_id, 'Visita Agendada', 'visita_agendada', '#8B5CF6', 4)
  RETURNING id INTO v_stage_id;
  
  INSERT INTO cadence_templates (organization_id, stage_key, name)
  VALUES (p_org_id, 'visita_agendada', 'Cadência Visita Agendada')
  RETURNING id INTO v_cadence_id;
  
  INSERT INTO cadence_tasks_template (cadence_template_id, position, day_offset, type, title, description, observation, recommended_message) VALUES
  (v_cadence_id, 1, -1, 'message', 'Confirmação (véspera)', 'Confirmar a visita no dia anterior', NULL, 'Bom dia {nome} 😊 Passando para confirmar nossa visita de amanhã às {horário}. Posso contar com sua presença?'),
  (v_cadence_id, 2, 0, 'message', 'Confirmação (no dia)', 'Confirmar a visita no dia', NULL, 'Bom dia {nome} 😄 Está tudo pronto para nossa visita de hoje às {horário}! Nos vemos em breve!'),
  (v_cadence_id, 3, 0, 'note', 'Estrutura da Reunião/Visita', 'Preparação para a visita', 'Estrutura: 1) Introdução calorosa 2) Conscientização das necessidades 3) Apresentação do imóvel 4) Transição para proposta 5) Negociação e próximos passos', NULL);

  -- ========================================
  -- 5. NO-SHOW / REAGENDAMENTO - Vermelho
  -- ========================================
  INSERT INTO stages (pipeline_id, name, stage_key, color, position)
  VALUES (p_pipeline_id, 'No-Show / Reagendamento', 'no_show', '#EF4444', 5)
  RETURNING id INTO v_stage_id;
  
  INSERT INTO cadence_templates (organization_id, stage_key, name)
  VALUES (p_org_id, 'no_show', 'Cadência No-Show')
  RETURNING id INTO v_cadence_id;
  
  INSERT INTO cadence_tasks_template (cadence_template_id, position, day_offset, type, title, description, observation, recommended_message) VALUES
  (v_cadence_id, 1, 0, 'call', 'Tentativa de reagendamento', 'Ligar para reagendar a visita', NULL, NULL),
  (v_cadence_id, 2, 0, 'message', 'Mensagem de reagendamento', 'Propor novo horário', NULL, 'Olá {nome}, não conseguimos realizar a visita no horário marcado. Aconteceu algum imprevisto? Vamos reagendar para um horário melhor?'),
  (v_cadence_id, 3, 1, 'call', '2ª tentativa de reagendamento', 'Segunda tentativa de contato', NULL, NULL),
  (v_cadence_id, 4, 1, 'call', '3ª tentativa de reagendamento', 'Terceira tentativa de contato', NULL, NULL),
  (v_cadence_id, 5, 3, 'message', 'Mensagem final de reagendamento', 'Última tentativa antes de encerrar', NULL, '{nome}, tentei falar com você algumas vezes sobre a visita. Vou aguardar seu retorno por até 24h para reagendarmos. Depois disso, entenderei que não há mais interesse no momento.');

  -- ========================================
  -- 6. EM NEGOCIAÇÃO - Rosa
  -- ========================================
  INSERT INTO stages (pipeline_id, name, stage_key, color, position)
  VALUES (p_pipeline_id, 'Em Negociação', 'em_negociacao', '#EC4899', 6)
  RETURNING id INTO v_stage_id;
  
  INSERT INTO cadence_templates (organization_id, stage_key, name)
  VALUES (p_org_id, 'em_negociacao', 'Cadência Em Negociação')
  RETURNING id INTO v_cadence_id;
  
  INSERT INTO cadence_tasks_template (cadence_template_id, position, day_offset, type, title, description, observation, recommended_message) VALUES
  (v_cadence_id, 1, 0, 'note', 'CTA - Provocar Proposta', 'Apresentar condições de pagamento', 'Ações: Apresentar valores detalhados, criar opções de pagamento flexíveis, personalizar condições conforme perfil do cliente', NULL),
  (v_cadence_id, 2, 0, 'message', 'Condições de pagamento', 'Enviar proposta comercial', NULL, '{nome}, separei algumas condições de pagamento que podem facilitar sua compra. Posso te enviar os detalhes agora?'),
  (v_cadence_id, 3, 1, 'call', 'Follow-up da proposta', 'Acompanhar andamento da negociação', NULL, NULL),
  (v_cadence_id, 4, 2, 'message', 'Reforço da proposta', 'Criar senso de urgência', NULL, '{nome}, essa condição especial tem prazo limitado. Conseguiu analisar a proposta? Estou aqui para tirar qualquer dúvida!');

  -- ========================================
  -- 7. FECHAMENTO - Verde
  -- ========================================
  INSERT INTO stages (pipeline_id, name, stage_key, color, position)
  VALUES (p_pipeline_id, 'Fechamento', 'fechamento', '#10B981', 7)
  RETURNING id INTO v_stage_id;
  
  INSERT INTO cadence_templates (organization_id, stage_key, name)
  VALUES (p_org_id, 'fechamento', 'Cadência Fechamento')
  RETURNING id INTO v_cadence_id;
  
  INSERT INTO cadence_tasks_template (cadence_template_id, position, day_offset, type, title, description, observation, recommended_message) VALUES
  (v_cadence_id, 1, 0, 'note', 'CTA - Fechamento', 'Preparar para assinatura', 'Checklist: 1) Existe objeção pendente? 2) Há ponto de restrição? 3) Documentação está pronta? 4) Qual a próxima etapa clara?', NULL),
  (v_cadence_id, 2, 0, 'call', 'Acompanhamento do fechamento', 'Resolver pendências finais', NULL, NULL),
  (v_cadence_id, 3, 1, 'message', 'Confirmação de documentação', 'Verificar status dos documentos', NULL, '{nome}, estamos quase lá! Preciso apenas confirmar se você já tem todos os documentos em mãos. Posso te ajudar com alguma dúvida?');

  -- ========================================
  -- 8. PERDIDO - Cinza Escuro
  -- ========================================
  INSERT INTO stages (pipeline_id, name, stage_key, color, position)
  VALUES (p_pipeline_id, 'Perdido', 'perdido', '#374151', 8)
  RETURNING id INTO v_stage_id;
  
  INSERT INTO cadence_templates (organization_id, stage_key, name)
  VALUES (p_org_id, 'perdido', 'Cadência Perdido')
  RETURNING id INTO v_cadence_id;
  
  -- Sem tarefas automáticas para leads perdidos

END;
$$;