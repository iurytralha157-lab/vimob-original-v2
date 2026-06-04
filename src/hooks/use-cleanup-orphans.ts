import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface OrphanMember {
  member_id: string;
  team_id?: string;
  round_robin_id?: string;
  user_id: string;
  team_name?: string;
  queue_name?: string;
  reason: string;
}

interface OrphanStats {
  teamOrphans: OrphanMember[];
  rrOrphans: OrphanMember[];
  total: number;
}

interface CleanupResult {
  team_members_removed: number;
  round_robin_members_removed: number;
  executed_at: string;
}

export function useOrphanStats() {
  return useQuery<OrphanStats>({
    queryKey: ['orphan-stats'],
    queryFn: async () => {
      // Use RPCs directly to fetch orphan stats
      const [teamResult, rrResult] = await Promise.all([
        supabase.rpc('find_orphan_team_members'),
        supabase.rpc('find_orphan_rr_members')
      ]);

      const teamOrphans = (teamResult.data || []) as OrphanMember[];
      const rrOrphans = (rrResult.data || []) as OrphanMember[];

      return {
        teamOrphans,
        rrOrphans,
        total: teamOrphans.length + rrOrphans.length,
      };
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  });
}

export function useCleanupOrphans() {
  const queryClient = useQueryClient();
  
  return useMutation<CleanupResult, Error>({
    mutationFn: async () => {
      // Try edge function first
      const { data, error } = await supabase.functions.invoke('cleanup-orphan-members', {
        body: {},
      });
      
      if (!error && data) {
        return data as CleanupResult;
      }

      // Fallback: call the RPC function directly
      console.log('[useCleanupOrphans] Edge function not available, using RPC fallback');
      const { data: rpcData, error: rpcError } = await supabase.rpc('cleanup_orphan_members');
      
      if (rpcError) {
        throw new Error(rpcError.message);
      }

      return rpcData as unknown as CleanupResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orphan-stats'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['round-robins'] });
      
      const teamCount = data?.team_members_removed || 0;
      const rrCount = data?.round_robin_members_removed || 0;
      
      if (teamCount > 0 || rrCount > 0) {
        toast.success(`Limpeza concluída: ${teamCount} de equipes, ${rrCount} de filas de distribuição`);
      } else {
        toast.info('Nenhum membro órfão encontrado para remover');
      }
    },
    onError: (error) => {
      console.error('[useCleanupOrphans] Error:', error);
      toast.error('Erro ao executar limpeza: ' + error.message);
    },
  });
}
