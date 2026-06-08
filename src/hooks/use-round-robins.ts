import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface RoundRobinRule {
  id: string;
  round_robin_id: string;
  match_type: string;
  match_value: string;
}

export interface RoundRobinMember {
  id: string;
  round_robin_id: string;
  user_id: string;
  team_id: string | null;
  position: number;
  weight: number | null;
  user?: { id: string; name: string; email?: string; avatar_url: string | null };
  leads_count?: number;
}

export interface RoundRobin {
  id: string;
  organization_id: string;
  created_by?: string | null;
  created_by_user?: { id: string; name: string | null; email: string | null } | null;
  name: string;
  is_active: boolean | null;
  last_assigned_index: number | null;
  created_at: string;
  // New columns from migration
  strategy: string | null;
  leads_distributed: number | null;
  // Advanced distribution columns
  target_pipeline_id: string | null;
  target_stage_id: string | null;
  ai_agent_id: string | null;
  settings: {
    enable_redistribution?: boolean;
    redistribution_timeout_minutes?: number;
    redistribution_warning_minutes?: number;
    redistribution_max_attempts?: number;
    preserve_position?: boolean;
    require_checkin?: boolean;
    reentry_behavior?: 'redistribute' | 'keep_assignee';
    schedule?: Array<{
      day: number;
      enabled: boolean;
      start: string;
      end: string;
    }>;
  } | null;
  reentry_behavior?: 'redistribute' | 'keep_assignee';
  // Joined data
  target_pipeline?: { id: string; name: string };
  target_stage?: { id: string; name: string; color: string };
  rules: RoundRobinRule[];
  members: RoundRobinMember[];
}

export function useRoundRobins() {
  return useQuery({
    queryKey: ['round-robins'],
    queryFn: async () => {
      const { data: roundRobins, error } = await supabase
        .from('round_robins')
        .select(`
          *,
          target_pipeline:pipelines!round_robins_target_pipeline_id_fkey(id, name),
          target_stage:stages!round_robins_target_stage_id_fkey(id, name, color)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const rrIds = (roundRobins || []).map(rr => rr.id);
      const creatorIds = [...new Set((roundRobins || []).map((rr: any) => rr.created_by).filter(Boolean))];
      
      // Get rules
      const { data: rules } = await supabase
        .from('round_robin_rules')
        .select('*')
        .in('round_robin_id', rrIds.length > 0 ? rrIds : ['no-rr']);
      
      // Get members with user info
      const { data: members } = await supabase
        .from('round_robin_members')
        .select('*, user:users(id, name, email, avatar_url, is_active)')
        .in('round_robin_id', rrIds.length > 0 ? rrIds : ['no-rr'])
        .order('position');
      
      // Get lead counts from assignments_log grouped by user
      const { data: assignments } = await supabase
        .from('assignments_log')
        .select('round_robin_id, assigned_user_id')
        .in('round_robin_id', rrIds.length > 0 ? rrIds : ['no-rr']);

      const { data: creators } = creatorIds.length > 0
        ? await supabase
            .from('users')
            .select('id, name, email')
            .in('id', creatorIds)
        : { data: [] };
      
      // Count by round robin
      const countsByRR = (assignments || []).reduce((acc, a) => {
        if (a.round_robin_id) {
          acc[a.round_robin_id] = (acc[a.round_robin_id] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);
      
      // Count by member (round_robin_id + user_id)
      const countsByMember = (assignments || []).reduce((acc, a) => {
        if (a.round_robin_id && a.assigned_user_id) {
          const key = `${a.round_robin_id}_${a.assigned_user_id}`;
          acc[key] = (acc[key] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);
      
      const rulesByRR = (rules || []).reduce((acc, r) => {
        if (!acc[r.round_robin_id]) acc[r.round_robin_id] = [];
        acc[r.round_robin_id].push(r as RoundRobinRule);
        return acc;
      }, {} as Record<string, RoundRobinRule[]>);
      
      const membersByRR = (members || [])
        .filter(m => m.user && (m.user as any).is_active !== false)
        .reduce((acc, m) => {
        if (!acc[m.round_robin_id]) acc[m.round_robin_id] = [];
        const memberKey = `${m.round_robin_id}_${m.user_id}`;
        acc[m.round_robin_id].push({
          ...m,
          leads_count: countsByMember[memberKey] || 0,
        } as RoundRobinMember);
        return acc;
      }, {} as Record<string, RoundRobinMember[]>);

      const creatorsById = (creators || []).reduce((acc, user) => {
        acc[user.id] = user;
        return acc;
      }, {} as Record<string, { id: string; name: string | null; email: string | null }>);
      
      return (roundRobins || []).map(rr => ({
        ...rr,
        created_by: (rr as any).created_by || null,
        created_by_user: (rr as any).created_by ? creatorsById[(rr as any).created_by] || null : null,
        strategy: (rr as any).strategy || 'simple',
        leads_distributed: countsByRR[rr.id] || (rr as any).leads_distributed || 0,
        target_pipeline_id: (rr as any).target_pipeline_id || null,
        target_stage_id: (rr as any).target_stage_id || null,
        ai_agent_id: (rr as any).ai_agent_id || null,
        settings: (rr as any).settings || null,
        target_pipeline: (rr as any).target_pipeline || null,
        target_stage: (rr as any).target_stage || null,
        rules: rulesByRR[rr.id] || [],
        members: membersByRR[rr.id] || [],
      })) as RoundRobin[];
    },
  });
}

export function useUpdateRoundRobin() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<RoundRobin> & { id: string }) => {
      const updateData: any = { ...updates };
      delete updateData.rules;
      delete updateData.members;
      delete updateData.leads_distributed;
      
      const { error } = await supabase
        .from('round_robins')
        .update(updateData)
        .eq('id', id);
      
      if (error) throw error;
      return { id, ...updateData };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['round-robins'] });
    },
    onError: (error) => {
      toast.error('Erro ao atualizar roleta: ' + error.message);
    },
  });
}

export function useDeleteRoundRobin() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('round_robins')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['round-robins'] });
      toast.success('Roleta excluída!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir roleta: ' + error.message);
    },
  });
}

interface UpdateMemberWeight {
  memberId: string;
  weight: number;
}

export function useUpdateRoundRobinMembers() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      roundRobinId, 
      members 
    }: { 
      roundRobinId: string; 
      members: UpdateMemberWeight[] 
    }) => {
      // Update each member's weight
      for (const member of members) {
        const { error } = await supabase
          .from('round_robin_members')
          .update({ weight: member.weight })
          .eq('id', member.memberId);
        
        if (error) throw error;
      }
      
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['round-robins'] });
      toast.success('Distribuição atualizada!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar distribuição: ' + error.message);
    },
  });
}

interface AddMemberInput {
  roundRobinId: string;
  userId: string;
  weight?: number;
}

export function useAddRoundRobinMember() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ roundRobinId, userId, weight = 10 }: AddMemberInput) => {
      // Get max position
      const { data: existing } = await supabase
        .from('round_robin_members')
        .select('position')
        .eq('round_robin_id', roundRobinId)
        .order('position', { ascending: false })
        .limit(1);
      
      const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;
      
      const { data, error } = await supabase
        .from('round_robin_members')
        .insert({
          round_robin_id: roundRobinId,
          user_id: userId,
          weight,
          position: nextPosition,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['round-robins'] });
      toast.success('Membro adicionado!');
    },
    onError: (error) => {
      toast.error('Erro ao adicionar membro: ' + error.message);
    },
  });
}

export function useRemoveRoundRobinMember() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from('round_robin_members')
        .delete()
        .eq('id', memberId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['round-robins'] });
      toast.success('Membro removido!');
    },
    onError: (error) => {
      toast.error('Erro ao remover membro: ' + error.message);
    },
  });
}
