update public.notification_templates as nt
set
  title = v.title,
  message = v.message,
  variables = v.variables,
  updated_at = now()
from (
  values
    (
      'update_phone_reminder',
      'Atualize seu telefone',
      $msg$📱 ATUALIZE SEU TELEFONE
🔔 Motivo: continuar recebendo notificações importantes
✅ Ação: acesse seu perfil e salve seu WhatsApp$msg$,
      array[]::text[]
    ),
    (
      'credentials_access',
      null,
      $msg$🔐 ACESSO VIMOB
👤 Usuário: {user_name}
📧 Login: {email}
🔑 Senha: {password}
🔗 Link: https://vimob.vettercompany.com.br/auth$msg$,
      array['user_name', 'email', 'password']::text[]
    ),
    (
      'automation_failed',
      'Falha em automação',
      $msg$⚠️ FALHA NA AUTOMAÇÃO
🤖 Automação: {nome_automacao}
👤 Lead: {nome_lead}
🧾 Motivo: {erro}$msg$,
      array['nome_automacao', 'nome_lead', 'erro']::text[]
    ),
    (
      'automation_repeated_failures',
      'Automação com falhas recorrentes',
      $msg$🚨 FALHAS RECORRENTES
🤖 Automação: {nome_automacao}
🔁 Total de falhas: {total_falhas}
✅ Ação: revise a configuração para evitar perda de atendimento$msg$,
      array['nome_automacao', 'total_falhas']::text[]
    ),
    (
      'automation_started',
      'Automação iniciada',
      $msg$🤖 AUTOMAÇÃO INICIADA
📌 Automação: {nome_automacao}
👤 Lead: {nome_lead}$msg$,
      array['nome_automacao', 'nome_lead']::text[]
    ),
    (
      'gamification_update',
      'Atualização de gamificação',
      $msg$🏆 GAMIFICAÇÃO
📌 {title}
🧾 {message}$msg$,
      array['user_name', 'title', 'message']::text[]
    ),
    (
      'ranking_update',
      null,
      $msg$🏆 RANKING ATUALIZADO
👤 Nome: {user_name}
📍 Posição: {position}
✅ Vendas: {total_sales}
🎯 Último lead: {last_lead}$msg$,
      array['user_name', 'position', 'total_sales', 'last_lead']::text[]
    ),
    (
      'manual_lead_registered',
      null,
      $msg$🔔 LEAD MANUAL CADASTRADO
👤 Lead: {lead_name}
🙋 Responsável: {user_name}
📌 Origem: Cadastro manual$msg$,
      array['lead_name', 'user_name']::text[]
    ),
    (
      'lead_assigned_to_user',
      'Novo lead atribuído',
      $msg$🔔 NOVO LEAD ATRIBUÍDO
👤 Nome: {lead_name}
📱 Origem: {source}
📍 Pipeline: {pipeline_name}
✅ Ação: acesse o CRM para atender$msg$,
      array['lead_name', 'source', 'pipeline_name']::text[]
    ),
    (
      'lead_moved_system',
      'Lead movido',
      $msg$🔄 LEAD MOVIDO
👤 Nome: {lead_name}
📍 De: {from_stage}
➡️ Para: {to_stage}$msg$,
      array['lead_name', 'from_stage', 'to_stage']::text[]
    ),
    (
      'lead_reentry',
      'Lead retornou',
      $msg$🔁 LEAD RETORNOU
👤 Nome: {lead_name}
✅ Ação: retome o atendimento pelo CRM$msg$,
      array['lead_name']::text[]
    ),
    (
      'lead_transferred_to_user',
      'Lead transferido para você',
      $msg$🔄 LEAD TRANSFERIDO
👤 Nome: {lead_name}
📍 Pipeline: {pipeline_name}
🙋 Transferido de: {old_user_name}
✅ Ação: acesse o CRM para atender$msg$,
      array['lead_name', 'pipeline_name', 'old_user_name']::text[]
    ),
    (
      'new_lead_received',
      'Novo lead',
      $msg$🔔 NOVO LEAD
👤 Nome: {lead_name}
📱 Origem: {source}
🎯 Campanha: {campaign_name}
📅 Data: {lead_created_at}$msg$,
      array['lead_name', 'source', 'campaign_name', 'lead_created_at']::text[]
    ),
    (
      'welcome_lead',
      null,
      $msg$👋 BOAS-VINDAS
👤 Nome: {nome}
🙋 Consultor: {corretor}
✅ Em breve vamos te chamar por aqui$msg$,
      array['nome', 'corretor']::text[]
    ),
    (
      'welcome_user',
      null,
      $msg$👋 BEM-VINDO AO VIMOB
👤 Usuário: {user_name}
📧 Login: {email}
✅ Sua conta já está pronta para uso$msg$,
      array['user_name', 'email']::text[]
    ),
    (
      'appointment_reminder',
      'Lembrete de compromisso',
      $msg$⏰ LEMBRETE DE COMPROMISSO
📌 Título: {titulo}
👤 Lead: {nome_lead}
📅 Horário: {horario}$msg$,
      array['titulo', 'horario', 'nome_lead', 'minutos']::text[]
    ),
    (
      'new_appointment',
      null,
      $msg$📅 NOVO AGENDAMENTO
📌 Título: {title}
📆 Data: {date}
⏰ Horário: {time}$msg$,
      array['user_name', 'title', 'date', 'time']::text[]
    ),
    (
      'deal_won_whatsapp',
      null,
      $msg$🎉 LEAD GANHO
👤 Nome: {lead_name}
🏆 Resultado: venda concluída
👏 Parabéns pela conquista!$msg$,
      array['lead_name']::text[]
    ),
    (
      'sla_overdue',
      'SLA vencido',
      $msg$🚨 SLA VENCIDO
👤 Lead: {lead_name}
⏱️ Aguardando há: {minutes} minutos
✅ Ação: priorize o atendimento$msg$,
      array['lead_name', 'minutes']::text[]
    ),
    (
      'sla_overdue_manager',
      'SLA vencido',
      $msg$🚨 SLA VENCIDO
👤 Lead: {lead_name}
⏱️ Aguardando há: {minutes} minutos
👥 Ação: verifique com a equipe responsável$msg$,
      array['lead_name', 'minutes']::text[]
    ),
    (
      'sla_warning',
      'SLA próximo do limite',
      $msg$⚠️ SLA PRÓXIMO DO LIMITE
👤 Lead: {lead_name}
⏱️ Aguardando há: {minutes} minutos
✅ Ação: responda antes do vencimento$msg$,
      array['lead_name', 'minutes']::text[]
    ),
    (
      'system_announcement',
      'Comunicado',
      $msg$📢 COMUNICADO
📌 {title}
🧾 {message}$msg$,
      array['title', 'message']::text[]
    ),
    (
      'test_push',
      'Teste de notificação',
      $msg$🧪 TESTE DE NOTIFICAÇÃO
✅ Status: push funcionando neste dispositivo$msg$,
      array[]::text[]
    ),
    (
      'whatsapp_disconnected',
      null,
      $msg$⚠️ WHATSAPP DESCONECTADO
📱 Sessão: {session_name}
✅ Ação: reconecte o QR Code para normalizar os envios$msg$,
      array['session_name', 'display_name']::text[]
    ),
    (
      'whatsapp_disconnected_admin',
      'WhatsApp desconectado',
      $msg$⚠️ WHATSAPP DESCONECTADO
📱 Sessão: {session_name}
🏢 Impacto: organização pode perder envios e atendimentos
✅ Ação: verifique a conexão$msg$,
      array['session_name']::text[]
    ),
    (
      'whatsapp_disconnected_system',
      'WhatsApp desconectado',
      $msg$⚠️ WHATSAPP DESCONECTADO
📱 Sessão: {session_name}
✅ Ação: reconecte o QR Code para evitar falhas no atendimento e nas automações$msg$,
      array['session_name', 'display_name']::text[]
    ),
    (
      'whatsapp_reconnect_required',
      'Reconecte seu WhatsApp',
      $msg$📱 RECONECTE SEU WHATSAPP
🔄 Motivo: atualizamos a integração do WhatsApp no VIMob
📍 Caminho: Configurações > Integrações > WhatsApp
⏱️ Tempo estimado: menos de um minuto$msg$,
      array[]::text[]
    )
) as v(slug, title, message, variables)
where nt.slug = v.slug;
