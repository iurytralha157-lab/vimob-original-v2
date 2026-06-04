import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UpdateCommissionParams {
  leadId: string;
  valorInteresse: number;
  commissionPercentage: number;
}

/**
 * Hook to update an existing commission when the lead's valor_interesse 
 * or commission_percentage changes after a deal is already won.
 */
export function useUpdateLeadCommission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadId, valorInteresse, commissionPercentage }: UpdateCommissionParams) => {
      // Check if commission exists for this lead
      const { data: existingCommission, error: fetchError } = await supabase
        .from('commissions')
        .select('id, amount, base_value')
        .eq('lead_id', leadId)
        .maybeSingle();

      if (fetchError) {
        console.error('Error fetching commission:', fetchError);
        throw fetchError;
      }

      // If no commission exists, skip (it will be created when status changes to won)
      if (!existingCommission) {
        console.log('No commission found for lead, skipping update');
        return null;
      }

      // Calculate new commission amount
      const newAmount = valorInteresse * (commissionPercentage / 100);

      // Only update if values actually changed
      if (existingCommission.base_value === valorInteresse && existingCommission.amount === newAmount) {
        console.log('Commission values unchanged, skipping update');
        return null;
      }

      // Update the commission
      const { data: updatedCommission, error: updateError } = await supabase
        .from('commissions')
        .update({
          base_value: valorInteresse,
          amount: newAmount,
          notes: `Comissão atualizada - ${commissionPercentage}% de R$ ${valorInteresse.toLocaleString('pt-BR')}`
        })
        .eq('id', existingCommission.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating commission:', updateError);
        throw updateError;
      }

      return {
        commission: updatedCommission,
        previousAmount: existingCommission.amount,
        newAmount
      };
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: ['commissions'] });
        queryClient.invalidateQueries({ queryKey: ['financial-dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['enhanced-dashboard-stats'] });
        queryClient.invalidateQueries({ queryKey: ['top-brokers'] });
        
        toast.success(
          `Comissão atualizada para R$ ${data.newAmount.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`,
          { description: `Valor anterior: R$ ${data.previousAmount.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` }
        );
      }
    },
    onError: (error) => {
      console.error('Error updating commission:', error);
      toast.error('Erro ao atualizar comissão');
    }
  });
}
