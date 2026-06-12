import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AssignLeadResult {
  success: boolean;
  lead_id: string;
  pipeline_id: string | null;
  stage_id: string | null;
  assigned_user_id: string | null;
  round_robin_used: boolean;
  error?: string;
}

export function useAssignLeadRoundRobin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadId: string): Promise<AssignLeadResult> => {
      const { data, error } = await supabase
        .rpc('redistribute_lead_round_robin' as any, { p_lead_id: leadId });

      if (error) {
        throw new Error(`Erro ao atribuir lead: ${error.message}`);
      }

      const rpcResult = data as unknown as {
        distribution_result?: AssignLeadResult;
      };

      return (rpcResult.distribution_result || data) as unknown as AssignLeadResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['stages'] });

      if (data.assigned_user_id) {
        toast.success('Lead atribuido com sucesso via round-robin!');
      } else if (data.round_robin_used === false) {
        toast.warning('Nenhum round-robin ativo encontrado. Configure um round-robin primeiro.');
      } else {
        toast.info('Lead processado, mas nao foi possivel atribuir automaticamente.');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
