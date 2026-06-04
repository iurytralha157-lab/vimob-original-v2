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
      // First, clear the assigned_user_id so the function can re-assign
      const { error: clearError } = await supabase
        .from('leads')
        .update({ assigned_user_id: null })
        .eq('id', leadId);

      if (clearError) {
        throw new Error(`Erro ao limpar atribuição: ${clearError.message}`);
      }

      // Then call the handle_lead_intake RPC to trigger round-robin
      // Using raw SQL call since the function was just created and types haven't regenerated
      const { data, error } = await supabase
        .rpc('handle_lead_intake' as any, { p_lead_id: leadId });

      if (error) {
        throw new Error(`Erro ao atribuir lead: ${error.message}`);
      }

      return data as unknown as AssignLeadResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['stages'] });
      
      if (data.assigned_user_id) {
        toast.success('Lead atribuído com sucesso via round-robin!');
      } else if (data.round_robin_used === false) {
        toast.warning('Nenhum round-robin ativo encontrado. Configure um round-robin primeiro.');
      } else {
        toast.info('Lead processado, mas não foi possível atribuir automaticamente.');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
