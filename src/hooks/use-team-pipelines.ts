import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useTeamPipelines(teamId?: string) {
  return useQuery({
    queryKey: ['team-pipelines', teamId],
    queryFn: async () => {
      if (!teamId) return [];
      
      const { data, error } = await supabase
        .from('team_pipelines')
        .select(`
          id,
          team_id,
          pipeline_id,
          pipeline:pipelines(id, name)
        `)
        .eq('team_id', teamId);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!teamId,
  });
}

export function useAllTeamPipelines() {
  return useQuery({
    queryKey: ['all-team-pipelines'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_pipelines')
        .select(`
          id,
          team_id,
          pipeline_id,
          pipeline:pipelines(id, name),
          team:teams(id, name)
        `);
      
      if (error) throw error;
      return data || [];
    },
  });
}

export function useAssignPipelineToTeam() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ teamId, pipelineId }: { teamId: string; pipelineId: string }) => {
      const { data, error } = await supabase
        .from('team_pipelines')
        .insert({ team_id: teamId, pipeline_id: pipelineId })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-pipelines'] });
      queryClient.invalidateQueries({ queryKey: ['all-team-pipelines'] });
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      toast.success('Pipeline vinculada à equipe!');
    },
    onError: (error: any) => {
      if (error.message?.includes('duplicate')) {
        toast.error('Pipeline já está vinculada a esta equipe');
      } else {
        toast.error('Erro ao vincular pipeline: ' + error.message);
      }
    },
  });
}

export function useRemovePipelineFromTeam() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ teamId, pipelineId }: { teamId: string; pipelineId: string }) => {
      const { error } = await supabase
        .from('team_pipelines')
        .delete()
        .eq('team_id', teamId)
        .eq('pipeline_id', pipelineId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-pipelines'] });
      queryClient.invalidateQueries({ queryKey: ['all-team-pipelines'] });
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      toast.success('Pipeline removida da equipe');
    },
  });
}

export function useSetTeamLeader() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ teamId, userId, isLeader }: { teamId: string; userId: string; isLeader: boolean }) => {
      const { error } = await supabase
        .from('team_members')
        .update({ is_leader: isLeader })
        .eq('team_id', teamId)
        .eq('user_id', userId);
      
      if (error) throw error;
    },
    onSuccess: (_, { isLeader }) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success(isLeader ? 'Líder definido!' : 'Líder removido');
    },
  });
}
