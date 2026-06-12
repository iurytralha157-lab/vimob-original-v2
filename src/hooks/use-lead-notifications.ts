import { supabase } from '@/integrations/supabase/client';
import { notificationService } from '@/services/NotificationService';

interface NotifyLeadCreatedParams {
  leadId: string;
  leadName: string;
  organizationId: string;
  pipelineId?: string | null;
  assignedUserId?: string | null;
  source?: string;
}

/**
 * Notifica todas as partes interessadas quando um lead é criado:
 * 1. Vendedor atribuído (assigned_user_id)
 * 2. Líderes das equipes vinculadas à pipeline
 * 3. Administradores da organização
 * 
 * Evita notificações duplicadas usando um Set de IDs já notificados.
 */
export async function notifyLeadCreated({
  leadId,
  leadName,
  organizationId,
  pipelineId,
  assignedUserId,
  source = 'manual',
}: NotifyLeadCreatedParams): Promise<void> {
  const notifiedUserIds = new Set<string>();
  const notifications: {
    user_id: string;
    organization_id: string;
    lead_id: string;
    title: string;
    content: string;
    type: string;
  }[] = [];

  const sourceLabel = getSourceLabel(source);

  // 1. Notificar o vendedor atribuído
  if (assignedUserId) {
    notifiedUserIds.add(assignedUserId);
    notifications.push({
      user_id: assignedUserId,
      organization_id: organizationId,
      lead_id: leadId,
      title: 'Novo lead recebido',
      content: `${leadName} foi atribuído a você (origem: ${sourceLabel})`,
      type: 'lead',
    });
  }

  // 2. Buscar líderes das equipes vinculadas à pipeline
  if (pipelineId) {
    try {
      // Buscar equipes vinculadas à pipeline
      const { data: teamPipelines } = await supabase
        .from('team_pipelines')
        .select('team_id')
        .eq('pipeline_id', pipelineId);

      if (teamPipelines && teamPipelines.length > 0) {
        const teamIds = teamPipelines.map(tp => tp.team_id);

        // Buscar líderes dessas equipes
        const { data: leaders } = await supabase
          .from('team_members')
          .select('user_id')
          .in('team_id', teamIds)
          .eq('is_leader', true);

        if (leaders) {
          for (const leader of leaders) {
            if (!notifiedUserIds.has(leader.user_id)) {
              notifiedUserIds.add(leader.user_id);
              notifications.push({
                user_id: leader.user_id,
                organization_id: organizationId,
                lead_id: leadId,
                title: 'Novo lead na equipe',
                content: `${leadName} entrou na pipeline da sua equipe (origem: ${sourceLabel})`,
                type: 'lead',
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Erro ao buscar líderes de equipe:', error);
    }
  }

  // 3. Notificar administradores da organização
  try {
    const { data: admins } = await supabase
      .from('users')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('role', 'admin')
      .eq('is_active', true);

    if (admins) {
      for (const admin of admins) {
        if (!notifiedUserIds.has(admin.id)) {
          notifiedUserIds.add(admin.id);
          notifications.push({
            user_id: admin.id,
            organization_id: organizationId,
            lead_id: leadId,
            title: 'Novo lead criado',
            content: `${leadName} foi criado na organização (origem: ${sourceLabel})`,
            type: 'lead',
          });
        }
      }
    }
  } catch (error) {
    console.error('Erro ao buscar administradores:', error);
  }

  // Use centralized service for each notification to ensure template usage and logging
  for (const notification of notifications) {
    try {
      await notificationService.send({
        eventKey: 'new_lead_received',
        organizationId: notification.organization_id,
        userId: notification.user_id,
        leadId: notification.lead_id,
        variables: {
          lead_name: leadName,
          source: sourceLabel
        }
      });
    } catch (error) {
      console.error('Erro ao disparar notificação via serviço:', error);
      // Escrita direta desativada para manter o isolamento por RLS.
      console.warn('Fallback direto em notifications desativado; use notification-dispatcher para preservar RLS.');
    }
  }

  // WhatsApp notification is now handled by the database trigger (handle_lead_intake -> notify_whatsapp_on_lead)
}

function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    manual: 'Manual',
    website: 'Site',
    whatsapp: 'WhatsApp',
    meta: 'Meta Ads',
    facebook: 'Facebook',
    instagram: 'Instagram',
    api: 'API',
    import: 'Importação',
  };
  return labels[source] || source;
}

// ==================== Notificação de Lead Movido (Telecom Only) ====================

interface NotifyLeadMovedParams {
  leadId: string;
  leadName: string;
  organizationId: string;
  pipelineId: string;
  fromStage: string;
  toStage: string;
  assignedUserId?: string | null;
}

/**
 * Notifica todas as partes interessadas quando um lead é movido entre estágios.
 * APENAS para organizações do segmento Telecom.
 * 
 * Segue a mesma lógica de notifyLeadCreated:
 * 1. Vendedor atribuído (assigned_user_id)
 * 2. Líderes das equipes vinculadas à pipeline
 * 3. Administradores da organização
 */
export async function notifyLeadMoved({
  leadId,
  leadName,
  organizationId,
  pipelineId,
  fromStage,
  toStage,
  assignedUserId,
}: NotifyLeadMovedParams): Promise<void> {
  const notifiedUserIds = new Set<string>();
  const notifications: {
    user_id: string;
    organization_id: string;
    lead_id: string;
    title: string;
    content: string;
    type: string;
  }[] = [];

  // 1. Notificar o vendedor atribuído
  if (assignedUserId) {
    notifiedUserIds.add(assignedUserId);
    notifications.push({
      user_id: assignedUserId,
      organization_id: organizationId,
      lead_id: leadId,
      title: 'Lead movido',
      content: `${leadName} foi movido de "${fromStage}" para "${toStage}"`,
      type: 'lead',
    });
  }

  // 2. Buscar líderes das equipes vinculadas à pipeline
  try {
    const { data: teamPipelines } = await supabase
      .from('team_pipelines')
      .select('team_id')
      .eq('pipeline_id', pipelineId);

    if (teamPipelines && teamPipelines.length > 0) {
      const teamIds = teamPipelines.map(tp => tp.team_id);

      const { data: leaders } = await supabase
        .from('team_members')
        .select('user_id')
        .in('team_id', teamIds)
        .eq('is_leader', true);

      if (leaders) {
        for (const leader of leaders) {
          if (!notifiedUserIds.has(leader.user_id)) {
            notifiedUserIds.add(leader.user_id);
            notifications.push({
              user_id: leader.user_id,
              organization_id: organizationId,
              lead_id: leadId,
              title: 'Lead movido na equipe',
              content: `${leadName} foi movido de "${fromStage}" para "${toStage}"`,
              type: 'lead',
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Erro ao buscar líderes de equipe:', error);
  }

  // 3. Notificar administradores da organização
  try {
    const { data: admins } = await supabase
      .from('users')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('role', 'admin')
      .eq('is_active', true);

    if (admins) {
      for (const admin of admins) {
        if (!notifiedUserIds.has(admin.id)) {
          notifiedUserIds.add(admin.id);
          notifications.push({
            user_id: admin.id,
            organization_id: organizationId,
            lead_id: leadId,
            title: 'Lead movido',
            content: `${leadName} foi movido de "${fromStage}" para "${toStage}"`,
            type: 'lead',
          });
        }
      }
    }
  } catch (error) {
    console.error('Erro ao buscar administradores:', error);
  }

  // Use centralized service for lead movement
  for (const notification of notifications) {
    try {
      await notificationService.send({
        templateSlug: 'lead_moved_system',
        organizationId: notification.organization_id,
        userId: notification.user_id,
        leadId: notification.lead_id,
        variables: {
          lead_name: leadName,
          from_stage: fromStage,
          to_stage: toStage
        }
      });
    } catch (error) {
      console.error('Erro ao disparar notificação de movimentação:', error);
      console.warn('Fallback direto em notifications desativado; use notification-dispatcher para preservar RLS.');
    }
  }
}

interface NotifyLeadWonParams {
  leadId: string;
  leadName: string;
  organizationId: string;
  organizationName: string;
  assignedUserId?: string | null;
}

/**
 * Notifica sobre fechamento de negócio (Lead Ganho).
 */
export async function notifyLeadWon({
  leadId,
  leadName,
  organizationId,
  organizationName,
  assignedUserId,
}: NotifyLeadWonParams): Promise<void> {
  const notifiedUserIds = new Set<string>();
  
  // 1. Notificar o vendedor atribuído
  if (assignedUserId) {
    notifiedUserIds.add(assignedUserId);
  }

  // 2. Notificar administradores da organização
  try {
    const { data: admins } = await supabase
      .from('users')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('role', 'admin')
      .eq('is_active', true);

    if (admins) {
      for (const admin of admins) {
        notifiedUserIds.add(admin.id);
      }
    }
  } catch (error) {
    console.error('Erro ao buscar administradores para notificação de venda:', error);
  }

  // Disparar para todos os usuários identificados
  for (const userId of notifiedUserIds) {
    try {
      await notificationService.send({
        eventKey: 'deal_won',
        organizationId,
        userId,
        leadId,
        variables: {
          lead_name: leadName,
          organization_name: organizationName
        }
      });
    } catch (error) {
      console.error(`Erro ao disparar notificação de venda para usuário ${userId}:`, error);
    }
  }
}
