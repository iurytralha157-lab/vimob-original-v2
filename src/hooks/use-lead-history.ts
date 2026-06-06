import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatResponseTime } from '@/hooks/use-lead-timeline';

export interface UnifiedHistoryEvent {
  id: string;
  type: string;
  label: string;
  content?: string | null;
  timestamp: string;
  actor?: {
    id: string;
    name: string;
    avatar_url?: string | null;
  } | null;
  source: 'timeline' | 'activity';
  metadata?: Record<string, any> | null;
  channel?: string | null;
  isAutomation?: boolean;
  // enriched fields
  sourceOrigin?: string | null; // 'meta_ads' | 'whatsapp' | 'website' | 'manual' | 'webhook' | etc.
  webhookName?: string | null;
  firstResponseSeconds?: number | null;
}

function sourceLabel(source?: string | null): string | null {
  if (!source) return null;
  const labels: Record<string, string> = {
    meta: 'Meta Ads',
    meta_ads: 'Meta Ads',
    whatsapp: 'WhatsApp',
    webhook: 'Webhook',
    website: 'Site',
    site: 'Site',
    wordpress: 'WordPress',
    manual: 'Manual',
  };
  return labels[source] || source;
}

// Types that only exist in activities (never in timeline) â€” no deduplication needed
const ACTIVITY_ONLY_TYPES = new Set([
  'call',
  'email',
  'note',
  'message',
  'task_completed',
  'contact_updated',
  'automation_message',
  'commission_created',
  'commission_updated',
]);

// Types where timeline is authoritative â€” skip activity duplicate
const TIMELINE_AUTHORITY_TYPES = new Set([
  'lead_created',
  'lead_assigned',
  'assignee_changed', // deduplica com lead_assigned da timeline
  'stage_changed',
  'stage_change',
  'first_response',
  'whatsapp_message_sent',
  'whatsapp_message_received',
  'call_initiated',
  'note_created',
  'tag_added',
  'tag_removed',
  'sla_warning',
  'sla_overdue',
  'lead_reentry',
]);

function buildLabel(type: string, metadata: Record<string, any>, source: 'timeline' | 'activity'): string {
  switch (type) {
    case 'lead_created': {
      const src = metadata?.source_label || metadata?.source;
      if (!src) return 'Lead criado';
      if (src === 'meta_ads' || src === 'Meta Ads') return 'Lead criado via Meta Ads';
      if (src === 'whatsapp' || src === 'WhatsApp') return 'Lead criado via WhatsApp';
      if (src === 'webhook' || src === 'Webhook') {
        const name = metadata?.form_name || metadata?.webhook_name;
        return name ? `Lead criado via "${name}"` : 'Lead criado via Webhook';
      }
      if (src === 'website' || src === 'Site') return 'Lead criado via Site';
      if (src === 'manual') return 'Lead criado manualmente';
      return `Lead criado via ${src}`;
    }
    case 'lead_assigned': {
      const queueName = metadata?.distribution_queue_name || metadata?.queue_name;
      const assignedName = metadata?.assigned_user_name;
      if (queueName && assignedName) return `Distribuído via "${queueName}" → ${assignedName}`;
      if (queueName) return `Distribuído via "${queueName}"`;
      if (metadata?.destination === 'admin_fallback') return 'Atribuído ao administrador (sem fila ativa)';
      if (metadata?.destination === 'pool') return 'Enviado para o Pool';
      if (assignedName) return `Atribuído a ${assignedName}`;
      return 'Distribuído';
    }
    case 'stage_changed':
    case 'stage_change': {
      const from = metadata?.old_stage_name || metadata?.from_stage;
      const to = metadata?.new_stage_name || metadata?.to_stage;
      if (!from || from === 'Desconhecido' || from === 'Unknown') {
        return `Iniciado no estágio ${to || 'Base'}`;
      }
      if (from && to) return `Movido: ${from} → ${to}`;
      return 'Estágio alterado';
    }
    case 'first_response':
      return 'Primeiro contato';
    case 'whatsapp_message_sent':
      return 'Mensagem enviada (WhatsApp)';
    case 'whatsapp_message_received':
      return 'Mensagem recebida (WhatsApp)';
    case 'call_initiated':
      return 'Ligação iniciada';
    case 'note_created':
    case 'note':
      return 'Nota adicionada';
    case 'tag_added':
      return metadata?.tag_name ? `Tag "${metadata.tag_name}" adicionada` : 'Tag adicionada';
    case 'tag_removed':
      return metadata?.tag_name ? `Tag "${metadata.tag_name}" removida` : 'Tag removida';
    case 'sla_warning':
      return 'SLA em alerta';
    case 'sla_overdue':
      return 'SLA estourado';
    case 'call':
      return 'Ligação realizada';
    case 'email':
      return 'Email enviado';
    case 'message':
      return 'Mensagem enviada';
    case 'automation_message': {
      const ch = metadata?.channel || 'whatsapp';
      return `Mensagem automática (${ch === 'whatsapp' ? 'WhatsApp' : ch})`;
    }
    case 'task_completed':
      return 'Tarefa concluída';
    case 'contact_updated':
      return 'Contato atualizado';
    case 'assignee_changed': {
      if (metadata?.distribution_queue_name && metadata?.to_user_name) {
        const prefix = metadata?.is_initial_distribution === false ? 'Redistribuído' : 'Distribuído';
        return `${prefix} por "${metadata.distribution_queue_name}" → ${metadata.to_user_name}`;
      }
      if (!metadata?.to_user_id && !metadata?.to_user_name) return 'Responsável removido';
      if (metadata?.to_user_name) return `Atribuído a ${metadata.to_user_name}`;
      return 'Responsável alterado';
    }
    case 'lead_reentry': {
      if (metadata?.entry_type === 'manual_reentry') return 'Lead reentrou';
      if (metadata?.webhook_name) return `Lead reentrou via webhook "${metadata.webhook_name}"`;
      if (metadata?.source === 'whatsapp') return 'Lead reentrou via WhatsApp';
      return `Lead reentrou via ${metadata?.source || 'sistema'}`;
    }
    case 'status_change': {
      const from = metadata?.from_status;
      const to = metadata?.to_status;
      const statusMap: Record<string, string> = { open: 'Aberto', won: 'Ganho', lost: 'Perdido' };
      if (from && to) return `Status: ${statusMap[from] || from} → ${statusMap[to] || to}`;
      return 'Status alterado';
    }
    case 'commission_created':
      return 'Comissão registrada';
    case 'commission_updated':
      return 'Comissão atualizada';
    case 'whatsapp':
      return 'Mensagem WhatsApp';
    case 'assignment':
      return metadata?.to_user_name ? `Atribuído a ${metadata.to_user_name}` : 'Lead atribuído';
    case 'automation_stage_move':
      return 'Movido por automação';
    case 'automation_tag_added':
      return 'Tag adicionada por automação';
    case 'visit_scheduled':
      return 'Visita agendada';
    case 'visit_made':
      return 'Visita realizada';
    case 'meeting_scheduled':
      return 'Reunião agendada';
    case 'meeting_made':
      return 'Reunião realizada';
    default: {
      if (metadata?.is_automation) return `Ação automática (${type})`;
      const translations: Record<string, string> = {
        'call_made': 'Ligação realizada',
        'message_sent': 'Mensagem enviada',
        'contact_made': 'Contato realizado',
        'prospecting_report': 'Relatório de prospecção',
        'agenda_created': 'Atividade agendada',
        'agenda_rescheduled': 'Atividade remarcada',
        'agenda_completed': 'Atividade concluída',
        'agenda_cancelled': 'Atividade cancelada'
      };
      return translations[type] || type.replace(/_/g, ' ');
    }
  }
}

function buildContent(type: string, metadata: Record<string, any>): string | undefined {
  switch (type) {
    case 'first_response': {
      const secs = metadata?.response_seconds;
      if (secs !== undefined && secs !== null) {
        return `Primeiro contato: ${formatResponseTime(Number(secs))}`;
      }
      return undefined;
    }
    case 'stage_changed':
    case 'stage_change': {
      const from = metadata?.old_stage_name || metadata?.from_stage;
      const to = metadata?.new_stage_name || metadata?.to_stage;
      const isInitial = !from || from === 'Desconhecido' || from === 'Unknown';
      if (!isInitial && from && to) return `${from} → ${to}`;
      return undefined;
    }
    default:
      return undefined;
  }
}

export function useLeadHistory(leadId: string | null) {
  const queryClient = useQueryClient();

  // Realtime: refresca o histórico quando activities ou lead_timeline_events mudam
  useEffect(() => {
    if (!leadId) return;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['lead-history-v2', leadId] });
    };

    const activitiesChannel = supabase
      .channel(`lead-history-activities-${leadId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities', filter: `lead_id=eq.${leadId}` }, invalidate)
      .subscribe();

    const timelineChannel = supabase
      .channel(`lead-history-timeline-${leadId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_timeline_events', filter: `lead_id=eq.${leadId}` }, invalidate)
      .subscribe();

    return () => {
      supabase.removeChannel(activitiesChannel);
      supabase.removeChannel(timelineChannel);
    };
  }, [leadId, queryClient]);

  return useQuery({
    queryKey: ['lead-history-v2', leadId],
    queryFn: async (): Promise<UnifiedHistoryEvent[]> => {
      if (!leadId) return [];

      // Fetch the timeline plus source/distribution evidence in parallel.
      const [timelineResult, activitiesResult, entriesResult, leadResult, distributionLogsResult] = await Promise.all([
        supabase
          .from('lead_timeline_events')
          .select('*')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: true }),
        supabase
          .from('activities')
          .select('*, user:users(id, name, avatar_url)')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: true }),
        supabase
          .from('lead_entry_events')
          .select('*')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: true }),
        supabase
          .from('leads')
          .select('id, source, utm_source, assigned_user_id, assigned_at, created_at, assigned_user:users!leads_assigned_user_id_fkey(id, name, avatar_url)')
          .eq('id', leadId)
          .maybeSingle(),
        supabase
          .from('round_robin_logs')
          .select('*, queue:round_robins(id, name), assigned_user:users!round_robin_logs_assigned_user_id_fkey(id, name, avatar_url)')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: true }),
      ]);

      if (timelineResult.error) throw timelineResult.error;
      if (activitiesResult.error) throw activitiesResult.error;
      if (entriesResult.error) throw entriesResult.error;
      if (leadResult.error) throw leadResult.error;
      if (distributionLogsResult.error) throw distributionLogsResult.error;

      const timelineEvents = timelineResult.data || [];
      const activityEvents = activitiesResult.data || [];
      const entryEvents = entriesResult.data || [];
      const lead = leadResult.data as any;
      const distributionLogs = distributionLogsResult.data || [];

      // Collect all user IDs that need resolution from metadata
      const userIdsToResolve = new Set<string>();
      [...timelineEvents, ...activityEvents].forEach((e: any) => {
        const meta = e.metadata || {};
        if (meta.user_id && typeof meta.user_id === 'string') userIdsToResolve.add(meta.user_id);
        if (meta.to_user_id && typeof meta.to_user_id === 'string') userIdsToResolve.add(meta.to_user_id);
        if (meta.from_user_id && typeof meta.from_user_id === 'string') userIdsToResolve.add(meta.from_user_id);
        if (e.user_id && typeof e.user_id === 'string') userIdsToResolve.add(e.user_id);
        if (e.actor_user_id && typeof e.actor_user_id === 'string') userIdsToResolve.add(e.actor_user_id);
      });
      distributionLogs.forEach((log: any) => {
        if (log.assigned_user_id && typeof log.assigned_user_id === 'string') userIdsToResolve.add(log.assigned_user_id);
      });
      if (lead?.assigned_user_id) userIdsToResolve.add(lead.assigned_user_id);

      // Resolve users
      const userMap = new Map<string, { id: string; name: string; avatar_url: string | null }>();
      if (userIdsToResolve.size > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, name, avatar_url')
          .in('id', Array.from(userIdsToResolve));
        (usersData || []).forEach((u: any) => userMap.set(u.id, u));
      }

      // â”€â”€ Deduplication fingerprint for activities (handles backend double-writes) â”€â”€
      function getActivityFingerprint(a: any): string {
        const meta = a.metadata || {};
        const ts = Math.floor(new Date(a.created_at).getTime() / 2000); // 2-second window
        return `${a.type}-${meta.to_stage || meta.to_user_id || meta.new_stage_name || ''}-${ts}`;
      }
      const seenActivities = new Set<string>();
      const dedupedActivityEvents = activityEvents.filter((a: any) => {
        const fp = getActivityFingerprint(a);
        if (seenActivities.has(fp)) return false;
        seenActivities.add(fp);
        return true;
      });

      // Build unified events from timeline
      const timelineMapped: UnifiedHistoryEvent[] = timelineEvents.map((e: any) => {
        const meta = (e.metadata as Record<string, any>) || {};
        const actorId = e.user_id || e.actor_user_id;
        const actor = actorId ? (userMap.get(actorId) || null) : null;

        return {
          id: `timeline-${e.id}`,
          type: e.event_type,
          label: buildLabel(e.event_type, meta, 'timeline'),
          content: buildContent(e.event_type, meta),
          timestamp: e.created_at || e.event_at,
          actor: actor ? { id: actor.id, name: actor.name, avatar_url: actor.avatar_url } : null,
          source: 'timeline' as const,
          metadata: meta,
          channel: e.channel || meta.channel || null,
          isAutomation: e.is_automation || false,
          sourceOrigin: meta.source || meta.source_label || null,
          webhookName: meta.webhook_name || meta.form_name || null,
          firstResponseSeconds: e.event_type === 'first_response' ? (meta.response_seconds ?? null) : null,
        };
      });

      // Track which timeline types exist for deduplication
      const timelineTypesPresent = new Set(timelineEvents.map((e: any) => e.event_type));
      const activityTypesPresent = new Set(dedupedActivityEvents.map((a: any) => a.type));

      // Enrich timeline lead_created with webhook_name from activity if missing
      const activityLeadCreated = dedupedActivityEvents.find((a: any) => a.type === 'lead_created');
      timelineMapped.forEach((e) => {
        if (e.type === 'lead_created' && !e.webhookName && activityLeadCreated) {
          const actMeta = (activityLeadCreated.metadata as Record<string, any>) || {};
          const wn = actMeta.webhook_name || actMeta.form_name || null;
          if (wn) {
            e.webhookName = wn;
            // Re-build label with enriched metadata
            e.label = buildLabel('lead_created', { ...((e.metadata as Record<string, any>) || {}), webhook_name: wn }, 'timeline');
          }
        }
      });

      // Build unified events from activities (with deduplication)
      const activityMapped: UnifiedHistoryEvent[] = dedupedActivityEvents
        .filter((a: any) => {
          // Always include activity-only types
          if (ACTIVITY_ONLY_TYPES.has(a.type)) return true;
          if (a.type === 'lead_reentry' && a.metadata?.entry_type === 'manual_reentry') return true;
          // Skip if timeline already has authority over this type
          if (TIMELINE_AUTHORITY_TYPES.has(a.type) && timelineTypesPresent.has(a.type)) return false;
          // Also map stage_change → stage_changed
          if (a.type === 'stage_change' && timelineTypesPresent.has('stage_changed')) return false;
          return true;
        })
        .map((a: any) => {
          const meta = (a.metadata as Record<string, any>) || {};
          const actorId = a.user_id;
          const actorFromQuery = a.user;
          const actor = actorFromQuery || (actorId ? userMap.get(actorId) || null : null);

          return {
            id: `activity-${a.id}`,
            type: a.type,
            label: buildLabel(a.type, meta, 'activity'),
            content: a.content || buildContent(a.type, meta),
            timestamp: a.created_at,
            actor: actor ? { id: actor.id, name: actor.name, avatar_url: actor.avatar_url || undefined } : null,
            source: 'activity' as const,
            metadata: meta,
            channel: meta.channel || null,
            isAutomation: meta.is_automation || a.type.startsWith('automation_'),
          };
        });

      // Build entry events mapped to unified format
      const entriesMapped: UnifiedHistoryEvent[] = entryEvents
        .filter((e: any) => e.entry_type !== 'initial') // Remove redundancy with "Lead criado"
        .map((e: any, index: number) => ({
          id: `entry-${e.id}`,
          type: 'lead_reentry',
          label: `${index + 2}ª Entrada`, // First re-entry is the 2nd entry
          content: `Origem: ${e.source}${e.campaign_name ? ` | Campanha: ${e.campaign_name}` : ''}`,
          timestamp: e.created_at,
          actor: null,
          source: 'timeline' as const,
          metadata: e,
          channel: e.source,
          isAutomation: false,
        }));

      const distributionMapped: UnifiedHistoryEvent[] = distributionLogs
        .filter((log: any) => {
          if (!log.round_robin_id && !log.assigned_user_id && !log.reason) return false;
          const hasTimelineQueue = timelineEvents.some((event: any) => {
            const meta = (event.metadata as Record<string, any>) || {};
            return event.event_type === 'lead_assigned'
              && (meta.distribution_queue_id === log.round_robin_id || meta.queue_id === log.round_robin_id);
          });
          return !hasTimelineQueue;
        })
        .map((log: any) => {
          const queueName = log.queue?.name || null;
          const assignedUser = log.assigned_user || (log.assigned_user_id ? userMap.get(log.assigned_user_id) : null);
          const assignedName = assignedUser?.name || null;
          const success = !!log.assigned_user_id;
          const reason = log.reason || null;
          const metadata = {
            queue_id: log.round_robin_id,
            distribution_queue_id: log.round_robin_id,
            queue_name: queueName,
            distribution_queue_name: queueName,
            assigned_user_id: log.assigned_user_id,
            assigned_user_name: assignedName,
            to_user_id: log.assigned_user_id,
            to_user_name: assignedName,
            reason,
            is_initial_distribution: true,
          };

          return {
            id: `distribution-${log.id}`,
            type: 'lead_assigned',
            label: success
              ? buildLabel('lead_assigned', metadata, 'timeline')
              : queueName
                ? `Fila "${queueName}" sem distribuição`
                : 'Sem fila de distribuição compatível',
            content: success ? undefined : reason || undefined,
            timestamp: log.created_at,
            actor: assignedUser ? { id: assignedUser.id, name: assignedUser.name, avatar_url: assignedUser.avatar_url || null } : null,
            source: 'timeline' as const,
            metadata,
            channel: null,
            isAutomation: true,
          };
        });

      const fallbackEvents: UnifiedHistoryEvent[] = [];
      const hasLeadCreated = timelineTypesPresent.has('lead_created') || activityTypesPresent.has('lead_created');
      if (lead && !hasLeadCreated) {
        const label = sourceLabel(lead.source);
        fallbackEvents.push({
          id: `lead-fallback-created-${lead.id}`,
          type: 'lead_created',
          label: buildLabel('lead_created', { source: lead.source, source_label: label }, 'timeline'),
          content: label ? `Origem: ${label}` : undefined,
          timestamp: lead.created_at,
          actor: null,
          source: 'timeline' as const,
          metadata: { source: lead.source, source_label: label, utm_source: lead.utm_source },
          channel: lead.source || null,
          isAutomation: false,
          sourceOrigin: lead.source || null,
        });
      }

      const hasAssignmentEvent =
        timelineTypesPresent.has('lead_assigned') ||
        timelineTypesPresent.has('assignee_changed') ||
        activityTypesPresent.has('assignee_changed') ||
        distributionMapped.length > 0;
      if (lead?.assigned_user_id && !hasAssignmentEvent) {
        const assignedUser = lead.assigned_user || userMap.get(lead.assigned_user_id);
        const assignedName = assignedUser?.name || 'Responsável atual';
        fallbackEvents.push({
          id: `lead-fallback-assigned-${lead.id}`,
          type: 'lead_assigned',
          label: `Atribuído a ${assignedName}`,
          content: 'Registro sem fila de distribuição vinculada',
          timestamp: lead.assigned_at || lead.created_at,
          actor: assignedUser ? { id: assignedUser.id, name: assignedUser.name, avatar_url: assignedUser.avatar_url || null } : null,
          source: 'timeline' as const,
          metadata: {
            assigned_user_id: lead.assigned_user_id,
            assigned_user_name: assignedName,
            to_user_id: lead.assigned_user_id,
            to_user_name: assignedName,
            source: lead.source,
            source_label: sourceLabel(lead.source),
          },
          channel: null,
          isAutomation: false,
        });
      }

      // Merge and sort chronologically (oldest first)
      return [...fallbackEvents, ...timelineMapped, ...activityMapped, ...entriesMapped, ...distributionMapped].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    },
    enabled: !!leadId,
    staleTime: 0,
    refetchInterval: 5000,
  });
}
