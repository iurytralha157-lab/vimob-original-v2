import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLeadVisibility, applyVisibilityFilter } from './use-lead-visibility';

export interface VGVStats {
  totalVGV: number;
  wonVGV: number;
  openVGV: number;
  lostVGV: number;
  totalLeads: number;
  wonLeads: number;
  openLeads: number;
  lostLeads: number;
}

export interface VGVByBroker {
  user_id: string;
  user_name: string;
  user_avatar: string | null;
  won_count: number;
  won_vgv: number;
  open_count: number;
  open_vgv: number;
  total_commission: number;
}

export interface StageVGV {
  stageId: string;
  totalVGV: number;
  openVGV: number;
  wonVGV: number;
  leadsCount: number;
}

export function useVGVStats(filters?: { 
  dateFrom?: Date; 
  dateTo?: Date; 
  userId?: string;
  pipelineId?: string;
}) {
  const { user } = useAuth();
  const { data: visibility } = useLeadVisibility(user?.id);

  return useQuery({
    queryKey: ['vgv-stats', filters, user?.id, visibility],
    enabled: !!user?.id && !!visibility,
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('id, deal_status, valor_interesse, assigned_user_id, created_at, won_at');
      
      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom.toISOString());
      }
      if (filters?.dateTo) {
        query = query.lte('created_at', filters.dateTo.toISOString());
      }
      
      // Aplicar visibilidade e filtros de usuário/equipe
      if (visibility) {
        query = applyVisibilityFilter(query, visibility, 'assigned_user_id', filters?.userId);
      }
      
      if (filters?.pipelineId) {
        query = query.eq('pipeline_id', filters.pipelineId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      const stats: VGVStats = {
        totalVGV: 0,
        wonVGV: 0,
        openVGV: 0,
        lostVGV: 0,
        totalLeads: data?.length || 0,
        wonLeads: 0,
        openLeads: 0,
        lostLeads: 0,
      };
      
      for (const lead of data || []) {
        const valor = lead.valor_interesse || 0;
        stats.totalVGV += valor;
        
        if (lead.deal_status === 'won') {
          stats.wonVGV += valor;
          stats.wonLeads++;
        } else if (lead.deal_status === 'lost') {
          stats.lostVGV += valor;
          stats.lostLeads++;
        } else {
          stats.openVGV += valor;
          stats.openLeads++;
        }
      }
      
      return stats;
    },
  });
}

export function useVGVByBroker(filters?: { 
  dateFrom?: Date; 
  dateTo?: Date; 
}) {
  const { user } = useAuth();
  const { data: visibility } = useLeadVisibility(user?.id);

  return useQuery({
    queryKey: ['vgv-by-broker', filters, user?.id, visibility],
    enabled: !!user?.id && !!visibility,
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select(`
          id, deal_status, valor_interesse, assigned_user_id, won_at, created_at,
          assignee:users!leads_assigned_user_id_fkey(id, name, avatar_url)
        `)
        .not('assigned_user_id', 'is', null);
      
      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom.toISOString());
      }
      if (filters?.dateTo) {
        query = query.lte('created_at', filters.dateTo.toISOString());
      }

      // Aplicar visibilidade
      if (visibility) {
        query = applyVisibilityFilter(query, visibility);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Group by broker
      const brokerMap = new Map<string, VGVByBroker>();
      
      for (const lead of data || []) {
        if (!lead.assigned_user_id || !lead.assignee) continue;
        
        const assignee = lead.assignee as any;
        if (!brokerMap.has(lead.assigned_user_id)) {
          brokerMap.set(lead.assigned_user_id, {
            user_id: lead.assigned_user_id,
            user_name: assignee.name || 'Sem nome',
            user_avatar: assignee.avatar_url,
            won_count: 0,
            won_vgv: 0,
            open_count: 0,
            open_vgv: 0,
            total_commission: 0,
          });
        }
        
        const broker = brokerMap.get(lead.assigned_user_id)!;
        const valor = lead.valor_interesse || 0;
        
        if (lead.deal_status === 'won') {
          broker.won_count++;
          broker.won_vgv += valor;
        } else if (lead.deal_status !== 'lost') {
          broker.open_count++;
          broker.open_vgv += valor;
        }
      }
      
      // Fetch commissions for each broker
      const brokerIds = Array.from(brokerMap.keys());
      if (brokerIds.length > 0) {
        const { data: commissions } = await supabase
          .from('commissions')
          .select('user_id, amount, status')
          .in('user_id', brokerIds);
        
        for (const commission of commissions || []) {
          if (commission.user_id && brokerMap.has(commission.user_id)) {
            brokerMap.get(commission.user_id)!.total_commission += commission.amount || 0;
          }
        }
      }
      
      return Array.from(brokerMap.values()).sort((a, b) => b.won_vgv - a.won_vgv);
    },
  });
}

export function useStageVGV(pipelineId?: string) {
  const { user } = useAuth();
  const { data: visibility } = useLeadVisibility(user?.id);

  return useQuery({
    queryKey: ['stage-vgv', pipelineId, user?.id, visibility],
    enabled: !!pipelineId && !!user?.id && !!visibility,
    queryFn: async () => {
      if (!pipelineId) return [];
      
      let query = supabase
        .from('leads')
        .select('id, stage_id, deal_status, valor_interesse, assigned_user_id')
        .eq('pipeline_id', pipelineId);

      // Aplicar visibilidade
      if (visibility) {
        query = applyVisibilityFilter(query, visibility);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      
      // Group by stage
      const stageMap = new Map<string, StageVGV>();
      
      for (const lead of data || []) {
        if (!lead.stage_id) continue;
        
        if (!stageMap.has(lead.stage_id)) {
          stageMap.set(lead.stage_id, {
            stageId: lead.stage_id,
            totalVGV: 0,
            openVGV: 0,
            wonVGV: 0,
            leadsCount: 0,
          });
        }
        
        const stage = stageMap.get(lead.stage_id)!;
        const valor = lead.valor_interesse || 0;
        
        stage.leadsCount++;
        stage.totalVGV += valor;
        
        if (lead.deal_status === 'won') {
          stage.wonVGV += valor;
        } else if (lead.deal_status !== 'lost') {
          stage.openVGV += valor;
        }
      }
      
      return Array.from(stageMap.values());
    },
  });
}
