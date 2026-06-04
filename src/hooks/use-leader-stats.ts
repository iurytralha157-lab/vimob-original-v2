import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LeaderStats {
  userId: string;
  userName: string;
  teamId: string;
  teamName: string;
  totalLeads: number;
  convertedLeads: number;
  conversionRate: number;
  avgTimeInStage: number | null;
}

export function useLeaderStats() {
  return useQuery({
    queryKey: ['leader-stats'],
    queryFn: async () => {
      // Get all team leaders
      const { data: teamMembers, error: membersError } = await supabase
        .from('team_members')
        .select(`
          user_id,
          team_id,
          is_leader,
          user:users(id, name),
          team:teams(id, name)
        `)
        .eq('is_leader', true);
      
      if (membersError) throw membersError;
      
      // Get leads for each leader's team pipelines
      const stats: LeaderStats[] = [];
      
      for (const member of teamMembers || []) {
        // Get pipelines for this team
        const { data: teamPipelines } = await supabase
          .from('team_pipelines')
          .select('pipeline_id')
          .eq('team_id', member.team_id);
        
        const pipelineIds = (teamPipelines || []).map(tp => tp.pipeline_id);
        
        if (pipelineIds.length === 0) {
          stats.push({
            userId: member.user_id,
            userName: (member.user as any)?.name || 'Desconhecido',
            teamId: member.team_id,
            teamName: (member.team as any)?.name || 'Desconhecido',
            totalLeads: 0,
            convertedLeads: 0,
            conversionRate: 0,
            avgTimeInStage: null,
          });
          continue;
        }
        
        // Get total leads in team's pipelines
        const { count: totalLeads } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .in('pipeline_id', pipelineIds);
        
        // Get converted leads (assuming last stage = converted)
        const { data: stages } = await supabase
          .from('stages')
          .select('id, position, pipeline_id')
          .in('pipeline_id', pipelineIds)
          .order('position', { ascending: false });
        
        // Get max position stage for each pipeline
        const lastStageIds = pipelineIds.map(pId => {
          const pipelineStages = (stages || []).filter(s => s.pipeline_id === pId);
          return pipelineStages[0]?.id;
        }).filter(Boolean);
        
        const { count: convertedLeads } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .in('stage_id', lastStageIds);
        
        const total = totalLeads || 0;
        const converted = convertedLeads || 0;
        
        stats.push({
          userId: member.user_id,
          userName: (member.user as any)?.name || 'Desconhecido',
          teamId: member.team_id,
          teamName: (member.team as any)?.name || 'Desconhecido',
          totalLeads: total,
          convertedLeads: converted,
          conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0,
          avgTimeInStage: null,
        });
      }
      
      return stats;
    },
  });
}

export function useTeamLeaderStats(teamId: string) {
  return useQuery({
    queryKey: ['team-leader-stats', teamId],
    queryFn: async () => {
      // Get leaders for this team
      const { data: leaders, error } = await supabase
        .from('team_members')
        .select(`
          user_id,
          user:users(id, name, avatar_url)
        `)
        .eq('team_id', teamId)
        .eq('is_leader', true);
      
      if (error) throw error;
      
      // Get pipelines for this team
      const { data: teamPipelines } = await supabase
        .from('team_pipelines')
        .select('pipeline_id')
        .eq('team_id', teamId);
      
      const pipelineIds = (teamPipelines || []).map(tp => tp.pipeline_id);
      
      const leaderStats = [];
      
      for (const leader of leaders || []) {
        // Get leads assigned to this leader
        let query = supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_user_id', leader.user_id);
        
        if (pipelineIds.length > 0) {
          query = query.in('pipeline_id', pipelineIds);
        }
        
        const { count: assignedLeads } = await query;
        
        leaderStats.push({
          userId: leader.user_id,
          user: leader.user,
          assignedLeads: assignedLeads || 0,
        });
      }
      
      return leaderStats;
    },
    enabled: !!teamId,
  });
}
