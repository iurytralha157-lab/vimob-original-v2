import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LeadTimelineEvent {
  id: string;
  organization_id: string;
  lead_id: string;
  event_type: string;
  event_at: string;
  actor_user_id: string | null;
  channel: string | null;
  is_automation: boolean;
  metadata: Record<string, any> | null;
  created_at: string;
  actor?: {
    id: string;
    name: string;
    avatar_url: string | null;
  } | null;
}

export function useLeadTimeline(leadId: string | null) {
  return useQuery({
    queryKey: ['lead-timeline', leadId],
    queryFn: async (): Promise<LeadTimelineEvent[]> => {
      if (!leadId) return [];
      
      const { data, error } = await supabase
        .from('lead_timeline_events')
        .select(`
          *,
          actor:users!lead_timeline_events_user_id_fkey(id, name, avatar_url)
        `)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true });
        
      if (error) throw error;
      
      // Map fields for compatibility
      return (data || []).map((event: any) => ({
        ...event,
        event_at: event.created_at,
        actor_user_id: event.user_id,
        channel: null,
        is_automation: false,
      })) as LeadTimelineEvent[];
    },
    enabled: !!leadId
  });
}

export interface FirstResponseMetrics {
  average: number;
  median: number;
  count: number;
  withinSla: number;
  slaPercentage: number;
}

export interface FirstResponseFilters {
  userId?: string;
  pipelineId?: string;
  dateFrom?: string;
  dateTo?: string;
  slaSeconds?: number; // Default 600 (10 minutes)
}

// Query real first response metrics from leads table
export function useFirstResponseMetrics(filters: FirstResponseFilters = {}) {
  return useQuery({
    queryKey: ['first-response-metrics', filters],
    queryFn: async (): Promise<FirstResponseMetrics> => {
      const slaSeconds = filters.slaSeconds || 600; // Default 10 minutes
      
      let query = supabase
        .from('leads')
        .select('first_response_seconds')
        .not('first_response_seconds', 'is', null);
      
      if (filters.userId) {
        query = query.eq('first_response_actor_user_id', filters.userId);
      }
      
      if (filters.pipelineId) {
        query = query.eq('pipeline_id', filters.pipelineId);
      }
      
      if (filters.dateFrom) {
        query = query.gte('first_response_at', filters.dateFrom);
      }
      
      if (filters.dateTo) {
        query = query.lte('first_response_at', filters.dateTo);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      if (!data || data.length === 0) {
        return { average: 0, median: 0, count: 0, withinSla: 0, slaPercentage: 0 };
      }
      
      const seconds = data.map(d => d.first_response_seconds!).sort((a, b) => a - b);
      const count = seconds.length;
      const sum = seconds.reduce((acc, s) => acc + s, 0);
      const average = Math.round(sum / count);
      const median = count % 2 === 0
        ? Math.round((seconds[count / 2 - 1] + seconds[count / 2]) / 2)
        : seconds[Math.floor(count / 2)];
      const withinSla = seconds.filter(s => s <= slaSeconds).length;
      const slaPercentage = Math.round((withinSla / count) * 100);
      
      return { average, median, count, withinSla, slaPercentage };
    }
  });
}

export interface UserFirstResponseRanking {
  userId: string;
  userName: string;
  userAvatar: string | null;
  average: number;
  median: number;
  count: number;
  slaPercentage: number;
}

// Query real first response ranking from leads table
export function useFirstResponseRanking(filters: Omit<FirstResponseFilters, 'userId'> = {}) {
  return useQuery({
    queryKey: ['first-response-ranking', filters],
    queryFn: async (): Promise<UserFirstResponseRanking[]> => {
      const slaSeconds = filters.slaSeconds || 600; // Default 10 minutes
      
      let query = supabase
        .from('leads')
        .select(`
          first_response_seconds,
          first_response_actor_user_id,
          actor:users!leads_first_response_actor_user_id_fkey(id, name, avatar_url)
        `)
        .not('first_response_seconds', 'is', null)
        .not('first_response_actor_user_id', 'is', null);
      
      if (filters.pipelineId) {
        query = query.eq('pipeline_id', filters.pipelineId);
      }
      
      if (filters.dateFrom) {
        query = query.gte('first_response_at', filters.dateFrom);
      }
      
      if (filters.dateTo) {
        query = query.lte('first_response_at', filters.dateTo);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching first response ranking:', error);
        return [];
      }
      
      if (!data || data.length === 0) {
        return [];
      }
      
      // Group by user
      const userMap = new Map<string, { seconds: number[]; user: any }>();
      
      data.forEach((lead: any) => {
        const userId = lead.first_response_actor_user_id;
        if (!userMap.has(userId)) {
          userMap.set(userId, { seconds: [], user: lead.actor });
        }
        userMap.get(userId)!.seconds.push(lead.first_response_seconds);
      });
      
      // Calculate stats per user
      const rankings: UserFirstResponseRanking[] = [];
      
      userMap.forEach((data, userId) => {
        const seconds = data.seconds.sort((a, b) => a - b);
        const count = seconds.length;
        const sum = seconds.reduce((acc, s) => acc + s, 0);
        const average = Math.round(sum / count);
        const median = count % 2 === 0
          ? Math.round((seconds[count / 2 - 1] + seconds[count / 2]) / 2)
          : seconds[Math.floor(count / 2)];
        const withinSla = seconds.filter(s => s <= slaSeconds).length;
        const slaPercentage = Math.round((withinSla / count) * 100);
        
        rankings.push({
          userId,
          userName: data.user?.name || 'Desconhecido',
          userAvatar: data.user?.avatar_url || null,
          average,
          median,
          count,
          slaPercentage,
        });
      });
      
      // Sort by average (fastest first)
      rankings.sort((a, b) => a.average - b.average);
      
      return rankings;
    }
  });
}

// Helper function to format seconds to human-readable
export function formatResponseTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}
