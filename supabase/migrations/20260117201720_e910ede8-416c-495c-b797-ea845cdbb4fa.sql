-- Remover trigger que impede inserções com organization_id explícito
DROP TRIGGER IF EXISTS enforce_org_cadence_templates ON public.cadence_templates;

-- Agora aplicar cadências padrão a TODAS as organizações existentes diretamente
INSERT INTO cadence_templates (stage_key, name, organization_id)
SELECT sk.stage_key, sk.name, o.id
FROM organizations o
CROSS JOIN (VALUES
  ('base', 'Base'),
  ('contactados', 'Contactados'),
  ('qualificados', 'Qualificados'),
  ('visita_agendada', 'Visita Agendada'),
  ('no_show', 'No-show'),
  ('negociacao', 'Proposta em Negociação'),
  ('fechamento', 'Fechado'),
  ('perdido', 'Perdido')
) AS sk(stage_key, name)
ON CONFLICT (stage_key, organization_id) DO NOTHING;

-- Inserir tarefas para cadência 'base'
INSERT INTO cadence_tasks_template (cadence_template_id, day_offset, type, title, observation, position)
SELECT ct.id, 0, 'note', 'Roteiro de Primeiro Contato', 
       'FAÇA A LIGAÇÃO RÁPIDA – ENTENDA O CLIENTE E MARQUE UM COMPROMISSO. 1) Abordagem animada 2) Crie conexão 3) Se apresente 4) Explique o motivo 5) Mostre postura consultiva', 0
FROM cadence_templates ct
WHERE ct.stage_key = 'base'
AND NOT EXISTS (SELECT 1 FROM cadence_tasks_template ctt WHERE ctt.cadence_template_id = ct.id);

-- Inserir tarefas para cadência 'contactados'
INSERT INTO cadence_tasks_template (cadence_template_id, day_offset, type, title, recommended_message, position)
SELECT ct.id, d.day_offset, d.type::task_type, d.title, d.recommended_message, d.position
FROM cadence_templates ct
CROSS JOIN (VALUES
  (1, 'call', '1ª tentativa de contato', NULL, 0),
  (1, 'message', '1.1 tentativa', 'Olá {nome}, tudo bem? Estou tentando falar com você para te apresentar as opções de imóveis que se encaixam no seu perfil. Assim que puder, me chama aqui que te explico tudo certinho.', 1),
  (2, 'call', '2ª tentativa de contato', NULL, 2),
  (4, 'call', '3ª tentativa de contato', NULL, 3),
  (4, 'message', '3.1 tentativa', 'Olá {nome}, tudo bem? Estou tentando falar com você para te apresentar as opções de imóveis que se encaixam no seu perfil. Assim que puder, me chama aqui que te explico tudo certinho.', 4),
  (4, 'message', '4.1 tentativa', 'Olá {nome}, tudo bem? Estou tentando falar com você para te apresentar as opções de imóveis que se encaixam no seu perfil. Assim que puder, me chama aqui que te explico tudo certinho.', 5),
  (5, 'message', '5.1 tentativa (última)', 'Olá {nome}, tudo bem? Estou tentando falar com você para te apresentar as opções de imóveis que se encaixam no seu perfil. Assim que puder, me chama aqui que te explico tudo certinho.', 6)
) AS d(day_offset, type, title, recommended_message, position)
WHERE ct.stage_key = 'contactados'
AND NOT EXISTS (SELECT 1 FROM cadence_tasks_template ctt WHERE ctt.cadence_template_id = ct.id);

-- Inserir tarefas para cadência 'qualificados'
INSERT INTO cadence_tasks_template (cadence_template_id, day_offset, type, title, recommended_message, position)
SELECT ct.id, d.day_offset, d.type::task_type, d.title, d.recommended_message, d.position
FROM cadence_templates ct
CROSS JOIN (VALUES
  (1, 'call', 'Follow-up de qualificação', NULL, 0),
  (1, 'message', 'Inacessibilidade - Mensagem 1', 'Olá {nome}, tudo bem? Tentei falar com você para avançarmos na escolha do seu imóvel ideal. Me chama aqui assim que puder para alinharmos os próximos passos.', 1),
  (2, 'call', 'Inacessibilidade - Ligação', NULL, 2),
  (3, 'message', 'Inacessibilidade - Mensagem 2', 'Olá {nome}, tudo bem? Tentei falar com você para avançarmos na escolha do seu imóvel ideal. Me chama aqui assim que puder para alinharmos os próximos passos.', 3),
  (5, 'call', 'Último contato de qualificação', NULL, 4)
) AS d(day_offset, type, title, recommended_message, position)
WHERE ct.stage_key = 'qualificados'
AND NOT EXISTS (SELECT 1 FROM cadence_tasks_template ctt WHERE ctt.cadence_template_id = ct.id);

-- Inserir tarefas para cadência 'visita_agendada'
INSERT INTO cadence_tasks_template (cadence_template_id, day_offset, type, title, recommended_message, position)
SELECT ct.id, d.day_offset, d.type::task_type, d.title, d.recommended_message, d.position
FROM cadence_templates ct
CROSS JOIN (VALUES
  (0, 'message', 'Confirmação de visita', 'Olá {nome}! Passando para confirmar nossa visita agendada. Está tudo certo para o horário combinado?', 0),
  (1, 'call', 'Ligação pós-visita', NULL, 1),
  (1, 'message', 'Follow-up pós-visita', 'Olá {nome}! Como foi sua experiência na visita? Ficou alguma dúvida sobre o imóvel? Estou à disposição para ajudar!', 2)
) AS d(day_offset, type, title, recommended_message, position)
WHERE ct.stage_key = 'visita_agendada'
AND NOT EXISTS (SELECT 1 FROM cadence_tasks_template ctt WHERE ctt.cadence_template_id = ct.id);

-- Inserir tarefas para cadência 'no_show'
INSERT INTO cadence_tasks_template (cadence_template_id, day_offset, type, title, recommended_message, position)
SELECT ct.id, d.day_offset, d.type::task_type, d.title, d.recommended_message, d.position
FROM cadence_templates ct
CROSS JOIN (VALUES
  (0, 'call', 'Contato imediato', NULL, 0),
  (0, 'message', 'Mensagem no-show', 'Olá {nome}, tudo bem? Não conseguimos te encontrar para a visita agendada. Aconteceu algum imprevisto? Podemos remarcar para outro momento.', 1),
  (1, 'call', 'Segunda tentativa', NULL, 2),
  (2, 'message', 'Última tentativa', 'Olá {nome}, ainda estou tentando falar com você sobre o reagendamento da visita. Me chama quando puder!', 3)
) AS d(day_offset, type, title, recommended_message, position)
WHERE ct.stage_key = 'no_show'
AND NOT EXISTS (SELECT 1 FROM cadence_tasks_template ctt WHERE ctt.cadence_template_id = ct.id);

-- Inserir tarefas para cadência 'negociacao'
INSERT INTO cadence_tasks_template (cadence_template_id, day_offset, type, title, recommended_message, position)
SELECT ct.id, d.day_offset, d.type::task_type, d.title, d.recommended_message, d.position
FROM cadence_templates ct
CROSS JOIN (VALUES
  (1, 'call', 'Follow-up de proposta', NULL, 0),
  (2, 'message', 'Lembrete de proposta', 'Olá {nome}! Como estão as considerações sobre a proposta? Estou à disposição para esclarecer qualquer dúvida ou ajustar condições.', 1),
  (4, 'call', 'Negociação ativa', NULL, 2),
  (7, 'message', 'Urgência de decisão', 'Olá {nome}! Gostaria de saber se conseguiu avaliar a proposta. Temos algumas condições especiais que podem expirar em breve.', 3)
) AS d(day_offset, type, title, recommended_message, position)
WHERE ct.stage_key = 'negociacao'
AND NOT EXISTS (SELECT 1 FROM cadence_tasks_template ctt WHERE ctt.cadence_template_id = ct.id);

-- Inserir tarefas para cadência 'fechamento'
INSERT INTO cadence_tasks_template (cadence_template_id, day_offset, type, title, observation, recommended_message, position)
SELECT ct.id, d.day_offset, d.type::task_type, d.title, d.observation, d.recommended_message, d.position
FROM cadence_templates ct
CROSS JOIN (VALUES
  (0, 'note', 'Checklist de documentação', 'Verificar: 1) Documentos pessoais 2) Comprovantes 3) Análise de crédito 4) Contrato 5) Assinaturas', NULL, 0),
  (1, 'call', 'Acompanhamento de documentação', NULL, NULL, 1),
  (3, 'message', 'Status do processo', NULL, 'Olá {nome}! Passando para informar sobre o andamento do seu processo. Qualquer novidade te aviso imediatamente!', 2)
) AS d(day_offset, type, title, observation, recommended_message, position)
WHERE ct.stage_key = 'fechamento'
AND NOT EXISTS (SELECT 1 FROM cadence_tasks_template ctt WHERE ctt.cadence_template_id = ct.id);

-- Inserir tarefas para cadência 'perdido'
INSERT INTO cadence_tasks_template (cadence_template_id, day_offset, type, title, recommended_message, position)
SELECT ct.id, d.day_offset, d.type::task_type, d.title, d.recommended_message, d.position
FROM cadence_templates ct
CROSS JOIN (VALUES
  (30, 'message', 'Reativação 30 dias', 'Olá {nome}! Tudo bem? Passando para saber se ainda está em busca de um imóvel. Temos novas opções que podem te interessar!', 0),
  (60, 'message', 'Reativação 60 dias', 'Olá {nome}! Esperamos que esteja bem. Caso ainda tenha interesse em imóveis, temos novidades no mercado. Posso te apresentar?', 1),
  (90, 'message', 'Reativação 90 dias', 'Olá {nome}! Há algum tempo conversamos sobre imóveis. Se sua busca ainda continua, ficarei feliz em ajudar novamente!', 2)
) AS d(day_offset, type, title, recommended_message, position)
WHERE ct.stage_key = 'perdido'
AND NOT EXISTS (SELECT 1 FROM cadence_tasks_template ctt WHERE ctt.cadence_template_id = ct.id);