import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { addMonths, addWeeks, addYears, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getFriendlyErrorMessage } from "@/lib/error-handler";

export type EventType = 'call' | 'email' | 'meeting' | 'task' | 'message' | 'visit';
export type ScheduleEventVisibility = 'default' | 'public' | 'private';

export interface ScheduleEvent {
  id: string;
  organization_id: string;
  user_id: string;
  lead_id: string | null;
  property_id: string | null;
  title: string;
  description: string | null;
  event_type: string | null;
  start_time: string;
  end_time: string;
  is_all_day: boolean | null;
  location: string | null;
  status: string | null;
  visibility?: ScheduleEventVisibility | null;
  reminder_minutes: number | null;
  recurrence_parent_id?: string | null;
  recurrence_rule?: string | null;
  recurrence_until?: string | null;
  recurrence_count?: number | null;
  google_event_id: string | null;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  user?: {
    id: string;
    name: string;
    avatar_url: string | null;
  } | null;
  lead?: {
    id: string;
    name: string;
    phone: string | null;
  } | null;
  property?: {
    id: string;
    title: string | null;
    code: string | null;
  } | null;
  completed_by_user?: {
    id: string;
    name: string;
  } | null;
  assignee_user_ids?: string[];
  is_masked?: boolean;
}

export type ScheduleRecurrenceFrequency = 'none' | 'weekly' | 'monthly' | 'yearly';

function addRecurrenceInterval(date: Date, frequency: ScheduleRecurrenceFrequency, amount: number) {
  if (frequency === 'weekly') return addWeeks(date, amount);
  if (frequency === 'monthly') return addMonths(date, amount);
  if (frequency === 'yearly') return addYears(date, amount);
  return date;
}

function buildRecurringOccurrences(params: {
  baseEvent: {
    organization_id: string;
    user_id: string;
    lead_id: string | null;
    property_id: string | null;
    title: string;
    description: string | null;
    event_type: string | null;
    start_time: string;
    end_time: string;
    is_all_day: boolean | null;
    location: string | null;
    visibility?: ScheduleEventVisibility | null;
  };
  parentId: string;
  frequency: ScheduleRecurrenceFrequency;
}) {
  if (params.frequency === 'none') return [];

  const start = new Date(params.baseEvent.start_time);
  const end = new Date(params.baseEvent.end_time);
  const maxOccurrences =
    params.frequency === 'weekly' ? 260 :
    params.frequency === 'monthly' ? 120 :
    20;
  const rows = [];

  for (let index = 1; index < maxOccurrences; index += 1) {
    const nextStart = addRecurrenceInterval(start, params.frequency, index);
    const nextEnd = addRecurrenceInterval(end, params.frequency, index);
    rows.push({
      organization_id: params.baseEvent.organization_id,
      user_id: params.baseEvent.user_id,
      lead_id: params.baseEvent.lead_id,
      property_id: params.baseEvent.property_id,
      title: params.baseEvent.title,
      description: params.baseEvent.description,
      event_type: params.baseEvent.event_type || 'task',
      start_time: nextStart.toISOString(),
      end_time: nextEnd.toISOString(),
      is_all_day: params.baseEvent.is_all_day || false,
      location: params.baseEvent.location,
      visibility: params.baseEvent.visibility || 'default',
      recurrence_parent_id: params.parentId,
      recurrence_rule: params.frequency,
      recurrence_until: null,
      recurrence_count: maxOccurrences,
    });
  }

  return rows;
}

function invalidateScheduleCaches(queryClient: ReturnType<typeof useQueryClient>, leadId?: string | null) {
  queryClient.invalidateQueries({ queryKey: ['schedule-events'] });
  if (leadId) {
    queryClient.invalidateQueries({ queryKey: ['activities', leadId] });
    queryClient.invalidateQueries({ queryKey: ['activities'] });
    queryClient.invalidateQueries({ queryKey: ['recent-activities'] });
    queryClient.invalidateQueries({ queryKey: ['lead-history-v2', leadId] });
    queryClient.invalidateQueries({ queryKey: ['lead-timeline', leadId] });
  }
}

function isEventParticipant(event: ScheduleEvent, currentUserId?: string) {
  if (!currentUserId) return false;
  return event.user_id === currentUserId || Boolean(event.assignee_user_ids?.includes(currentUserId));
}

function applyScheduleVisibility(events: ScheduleEvent[], currentUserId?: string, currentUserRole?: string | null) {
  return events
    .filter((event) => event.visibility !== 'private' || isEventParticipant(event, currentUserId))
    .map((event) => {
      if (event.visibility !== 'public') return event;
      if (isEventParticipant(event, currentUserId)) return event;

      return {
        ...event,
        title: 'Horario ocupado',
        description: 'Informacao privada',
        event_type: 'task',
        lead_id: null,
        property_id: null,
        location: null,
        lead: null,
        property: null,
        is_masked: true,
      };
    });
}

async function logScheduleEventToTimeline(params: {
  lead_id: string;
  organization_id: string;
  actor_id: string;
  action_type: 'created' | 'rescheduled' | 'completed' | 'cancelled';
  event_title: string;
  event_type: string;
  start_time: string;
  assigned_user_id: string;
}) {
  try {
    // Fetch names for description
    const [
      { data: actor },
      { data: assignedUser },
      { data: lead }
    ] = await Promise.all([
      supabase.from('users').select('name').eq('id', params.actor_id).single(),
      supabase.from('users').select('name').eq('id', params.assigned_user_id).single(),
      supabase.from('leads').select('name').eq('id', params.lead_id).single()
    ]);

    const formattedDate = format(new Date(params.start_time), "dd/MM 'às' HH:mm", { locale: ptBR });
    const eventLabel = params.event_type === 'call' ? 'uma ligação' :
                      params.event_type === 'meeting' ? 'uma reunião' :
                      params.event_type === 'visit' ? 'uma visita' :
                      params.event_type === 'task' ? 'uma tarefa' :
                      params.event_type === 'message' ? 'uma mensagem' :
                      params.event_type === 'email' ? 'um e-mail' : 'uma atividade';

    let description = '';
    let title = '';

    if (params.action_type === 'created') {
      title = 'Atividade Agendada';
      description = `${actor?.name || 'Usuário'} agendou ${eventLabel} para ${assignedUser?.name || 'ele mesmo'} com o lead ${lead?.name || 'Lead'} para o dia ${formattedDate}.`;
    } else if (params.action_type === 'rescheduled') {
      title = 'Atividade Remarcada';
      description = `${actor?.name || 'Usuário'} remarcou ${eventLabel} com o lead ${lead?.name || 'Lead'} para o dia ${formattedDate}.`;
    } else if (params.action_type === 'completed') {
      title = 'Atividade Concluída';
      description = `${actor?.name || 'Usuário'} concluiu a atividade "${params.event_title}" com o lead ${lead?.name || 'Lead'}.`;
    } else if (params.action_type === 'cancelled') {
      title = 'Atividade Cancelada';
      description = `${actor?.name || 'Usuario'} cancelou a atividade "${params.event_title}" com o lead ${lead?.name || 'Lead'}.`;
    }

    await supabase.from('lead_timeline_events').insert({
      organization_id: params.organization_id,
      lead_id: params.lead_id,
      user_id: params.actor_id,
      event_type: `agenda_${params.action_type}`,
      title,
      description,
      metadata: {
        event_type: params.event_type,
        start_time: params.start_time,
        assigned_to: params.assigned_user_id
      }
    });
  } catch (error) {
    console.error('Error logging schedule event to timeline:', error);
  }
}

interface UseScheduleEventsOptions {
  userId?: string;
  leadId?: string;
  startDate?: Date;
  endDate?: Date;
}

export function useScheduleEvents(options: UseScheduleEventsOptions = {}) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['schedule-events', options],
    queryFn: async () => {
      let assignedEventIds: string[] = [];

      // Se houver filtro de usuário, buscamos eventos onde ele Ã© co-responsÃ¡vel
      if (options.userId) {
        const { data: assignments } = await supabase
          .from('schedule_event_assignees')
          .select('event_id')
          .eq('user_id', options.userId);
        
        if (assignments && assignments.length > 0) {
          assignedEventIds = assignments.map(a => a.event_id);
        }
      }

      let query = supabase
        .from('schedule_events')
        .select(`
          id, organization_id, user_id, lead_id, property_id, title, 
          description, event_type, start_time, end_time, is_all_day, location, status, visibility,
          completed_by, completed_at, recurrence_parent_id, recurrence_rule, recurrence_until, recurrence_count,
          user:users!schedule_events_user_id_fkey(id, name, avatar_url),
          lead:leads(id, name, phone),
          property:properties(id, title, code),
          completed_by_user:users!schedule_events_completed_by_fkey(id, name)
        `)
        .order('start_time', { ascending: true });

      if (options.userId) {
        if (assignedEventIds.length > 0) {
          // Filtra onde ele Ã© o dono OU onde ele está na lista de co-responsÃ¡veis
          query = query.or(`user_id.eq.${options.userId},id.in.(${assignedEventIds.join(',')})`);
        } else {
          query = query.eq('user_id', options.userId);
        }
      }

      if (options.leadId) {
        query = query.eq('lead_id', options.leadId);
      }

      if (options.startDate) {
        query = query.gte('start_time', options.startDate.toISOString());
      }

      if (options.endDate) {
        query = query.lte('start_time', options.endDate.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      const eventRows = (data || []) as ScheduleEvent[];
      if (eventRows.length === 0) {
        return [];
      }

      const { data: assignmentRows } = await (supabase as any)
        .from('schedule_event_assignees')
        .select('event_id, user_id')
        .in('event_id', eventRows.map((event) => event.id));

      const assigneesByEvent = new Map<string, string[]>();
      (assignmentRows || []).forEach((assignment: any) => {
        if (!assignment?.event_id || !assignment?.user_id) return;
        assigneesByEvent.set(assignment.event_id, [
          ...(assigneesByEvent.get(assignment.event_id) || []),
          assignment.user_id,
        ]);
      });

      const eventsWithAssignees = eventRows.map((event) => ({
        ...event,
        assignee_user_ids: assigneesByEvent.get(event.id) || [],
      }));

      return applyScheduleVisibility(eventsWithAssignees, profile?.id, profile?.role);
    },
    enabled: !!profile?.organization_id,
    staleTime: 1000 * 60 * 5, // Cache por 5 minutos
  });
}

export function useCreateScheduleEvent() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (event: {
      title: string;
      description?: string;
      event_type?: EventType;
      start_time: string;
      end_time: string;
      is_all_day?: boolean;
      user_id?: string;
      lead_id?: string;
      property_id?: string | null;
      location?: string;
      visibility?: ScheduleEventVisibility;
      recurrence_rule?: ScheduleRecurrenceFrequency;
      assignee_ids?: string[];
    }) => {
      if (!profile?.organization_id) throw new Error('Organização não encontrada');

      const { data, error } = await supabase
        .from('schedule_events')
        .insert({
          organization_id: profile.organization_id,
          user_id: event.user_id || profile.id,
          lead_id: event.lead_id || null,
          property_id: event.property_id || null,
          title: event.title,
          description: event.description || null,
          event_type: event.event_type || 'task',
          start_time: event.start_time,
          end_time: event.end_time,
          is_all_day: event.is_all_day || false,
          location: event.location || null,
          visibility: event.visibility || 'default',
          recurrence_rule: event.recurrence_rule && event.recurrence_rule !== 'none' ? event.recurrence_rule : null,
          recurrence_until: null,
          recurrence_count: event.recurrence_rule && event.recurrence_rule !== 'none' ? 1 : null,
        })
        .select()
        .single();

      if (error) throw error;

      const assigneeIds = Array.from(new Set((event.assignee_ids || []).filter((id) => id && id !== data.user_id)));

      const recurringRows = buildRecurringOccurrences({
        baseEvent: {
          organization_id: data.organization_id,
          user_id: data.user_id,
          lead_id: data.lead_id,
          property_id: data.property_id,
          title: data.title,
          description: data.description,
          event_type: data.event_type,
          start_time: data.start_time,
          end_time: data.end_time,
          is_all_day: data.is_all_day,
          location: data.location,
          visibility: data.visibility,
        },
        parentId: data.id,
        frequency: event.recurrence_rule || 'none',
      });

      let recurringData: { id: string }[] = [];
      if (recurringRows.length > 0) {
        const { data: insertedRecurring, error: recurrenceError } = await supabase
          .from('schedule_events')
          .insert(recurringRows as any)
          .select('id');

        if (recurrenceError) throw recurrenceError;
        recurringData = insertedRecurring || [];
      }

      if (assigneeIds.length > 0) {
        const assigneeRows = [data.id, ...recurringData.map((item) => item.id)].flatMap((eventId) =>
          assigneeIds.map((userId) => ({
            event_id: eventId,
            user_id: userId,
            organization_id: profile.organization_id,
          }))
        );

        const { error: assigneeError } = await (supabase as any)
          .from('schedule_event_assignees')
          .insert(assigneeRows);

        if (assigneeError && !assigneeError.message?.includes('duplicate')) {
          throw assigneeError;
        }
      }
      
      // Log to timeline if lead is present - non-blocking fire-and-forget
      if (data.lead_id && profile) {
        await logScheduleEventToTimeline({
          lead_id: data.lead_id,
          organization_id: data.organization_id,
          actor_id: profile.id,
          assigned_user_id: data.user_id,
          event_title: data.title,
          event_type: data.event_type || 'task',
          start_time: data.start_time,
          action_type: 'created'
        }).catch(err => console.error('Timeline log error:', err));
      }

      // Record activity log if needed - fire-and-forget
      if (data.lead_id && (data.event_type === 'visit' || data.event_type === 'meeting')) {
        supabase.from('activities').insert({
          lead_id: data.lead_id,
          user_id: data.user_id,
          type: data.event_type === 'visit' ? 'visit_scheduled' : 'meeting_scheduled',
          content: `${data.event_type === 'visit' ? 'Visita' : 'Reunião'} agendada: ${data.title}`,
          metadata: { schedule_event_id: data.id }
        }).then(({ error: activityError }) => {
          if (activityError) console.error('Error creating activity log:', activityError);
        });
      }

      // Send WhatsApp notification - fire-and-forget
      (async () => {
        try {
          const { notificationService } = await import('@/services/NotificationService');
          const { data: userData } = await supabase
            .from('users')
            .select('name, organization_id')
            .eq('id', data.user_id)
            .single();

          if (userData) {
            await notificationService.send({
              eventKey: 'new_appointment',
              organizationId: userData.organization_id || '',
              userId: data.user_id,
              variables: {
                user_name: userData.name || 'Corretor',
                title: data.title,
                date: format(new Date(data.start_time), 'dd/MM/yyyy'),
                time: format(new Date(data.start_time), 'HH:mm')
              }
            });
          }
        } catch (err) {
          console.error('Failed to send appointment notification:', err);
        }
      })();

      return data;
    },
    onSuccess: (data) => {
      invalidateScheduleCaches(queryClient, data?.lead_id);
      toast.success('Atividade criada com sucesso!');
    },
    onError: (error: Error) => {
      console.error('Error creating schedule event:', error);
      toast.error(getFriendlyErrorMessage(error));
    },
  });
}

export function useUpdateScheduleEvent() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ScheduleEvent> & { id: string }) => {
      // Get current event data for timeline logging
      const { data: currentEvent } = await supabase
        .from('schedule_events')
        .select('*')
        .eq('id', id)
        .single();

      const { data, error } = await supabase
        .from('schedule_events')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      
      // Log to timeline if lead is present and something relevant changed
      if (data.lead_id && profile) {
        const timeChanged = updates.start_time && updates.start_time !== currentEvent?.start_time;
        const statusChangedToCompleted = updates.status === 'completed' && currentEvent?.status !== 'completed';
        
        if (timeChanged || statusChangedToCompleted) {
          await logScheduleEventToTimeline({
            lead_id: data.lead_id,
            organization_id: data.organization_id,
            actor_id: profile.id,
            assigned_user_id: data.user_id,
            event_title: data.title,
            event_type: data.event_type || 'task',
            start_time: data.start_time,
            action_type: statusChangedToCompleted ? 'completed' : 'rescheduled'
          });
        }

        // Registrar atividade no histórico se foi concluÃ­do
        if (statusChangedToCompleted && (data.event_type === 'visit' || data.event_type === 'meeting')) {
          const { error: activityError } = await supabase.from('activities').insert({
            lead_id: data.lead_id,
            user_id: data.user_id,
            type: data.event_type === 'visit' ? 'visit_confirmed' : 'meeting_held',
            content: `${data.event_type === 'visit' ? 'Visita realizada' : 'Reunião realizada'}: ${data.title}`,
            metadata: { schedule_event_id: data.id }
          });
          
          if (activityError) {
            console.error('Error creating activity log (non-critical):', activityError);
          }
        }

      }

      return data;
    },
    onSuccess: (data) => {
      invalidateScheduleCaches(queryClient, data?.lead_id);
      toast.success('Atividade atualizada!');
    },
    onError: (error: Error) => {
      console.error('Error updating schedule event:', error);
      toast.error('Erro ao atualizar atividade');
    },
  });
}

export function useCompleteScheduleEvent() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const isCompleted = status === 'completed';
      const updates: any = { status };

      const { data: currentEvent } = await supabase
        .from('schedule_events')
        .select('id, status')
        .eq('id', id)
        .single();

      if (currentEvent?.status === status) {
        const { data, error } = await supabase
          .from('schedule_events')
          .select(`
            *,
            user:users!schedule_events_user_id_fkey(id, name, avatar_url),
            lead:leads(id, name, phone)
          `)
          .eq('id', id)
          .single();

        if (error) throw error;
        return data;
      }
      
      if (isCompleted) {
        updates.completed_by = profile?.id;
        updates.completed_at = new Date().toISOString();
      } else {
        updates.completed_by = null;
        updates.completed_at = null;
      }

      const { data, error } = await supabase
        .from('schedule_events')
        .update(updates)
        .eq('id', id)
        .select(`
          *,
          user:users!schedule_events_user_id_fkey(id, name, avatar_url),
          lead:leads(id, name, phone)
        `)
        .single();

      if (error) throw error;

      // Log to timeline if lead is present and status is completed
      if (data.lead_id && status === 'completed' && profile) {
        logScheduleEventToTimeline({
          lead_id: data.lead_id,
          organization_id: data.organization_id,
          actor_id: profile.id,
          assigned_user_id: data.user_id,
          event_title: data.title,
          event_type: data.event_type || 'task',
          start_time: data.start_time,
          action_type: 'completed'
        });
      }

      // Registrar atividade no histórico se foi concluÃ­do
      if (status === 'completed' && (data.event_type === 'visit' || data.event_type === 'meeting')) {
        const { error: activityError } = await supabase.from('activities').insert({
          lead_id: data.lead_id,
          user_id: data.user_id,
          type: data.event_type === 'visit' ? 'visit_confirmed' : 'meeting_held',
          content: `${data.event_type === 'visit' ? 'Visita realizada' : 'Reunião realizada'}: ${data.title}`,
          metadata: { schedule_event_id: data.id }
        });
        
        if (activityError) {
          console.error('Error creating activity log (non-critical):', activityError);
        }
      }


      return data;
    },
    onSuccess: (data) => {
      invalidateScheduleCaches(queryClient, data?.lead_id);
      toast.success(data.status === 'completed' ? 'Atividade concluida!' : 'Atividade reaberta');
    },
    onError: (error: Error) => {
      console.error('Error completing schedule event:', error);
      toast.error('Erro ao atualizar atividade');
    },
  });
}

export function useDeleteScheduleEvent() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data: currentEvent } = await supabase
        .from('schedule_events')
        .select('*')
        .eq('id', id)
        .single();

      const { error } = await supabase
        .from('schedule_events')
        .delete()
        .eq('id', id);

      if (error) throw error;

      if (currentEvent?.lead_id && profile) {
        await logScheduleEventToTimeline({
          lead_id: currentEvent.lead_id,
          organization_id: currentEvent.organization_id,
          actor_id: profile.id,
          assigned_user_id: currentEvent.user_id,
          event_title: currentEvent.title,
          event_type: currentEvent.event_type || 'task',
          start_time: currentEvent.start_time,
          action_type: 'cancelled'
        });
      }

      return currentEvent;
    },
    onSuccess: (data) => {
      invalidateScheduleCaches(queryClient, data?.lead_id);
      toast.success('Atividade removida!');
    },
    onError: (error: Error) => {
      console.error('Error deleting schedule event:', error);
      toast.error('Erro ao remover atividade');
    },
  });
}

