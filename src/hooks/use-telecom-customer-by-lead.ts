import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { TelecomCustomer, CreateTelecomCustomerInput } from './use-telecom-customers';

export interface TelecomCustomerByLead extends TelecomCustomer {
  plan?: {
    id: string;
    name: string;
    code: string;
    price: number;
  } | null;
}

export function useTelecomCustomerByLead(leadId: string | null) {
  return useQuery({
    queryKey: ['telecom-customer-by-lead', leadId],
    queryFn: async () => {
      if (!leadId) return null;

      const { data, error } = await supabase
        .from('telecom_customers')
        .select(`
          *,
          plan:service_plans(id, name, code, price)
        `)
        .eq('lead_id', leadId)
        .maybeSingle();

      if (error) throw error;
      return data as TelecomCustomerByLead | null;
    },
    enabled: !!leadId,
  });
}

export interface UpsertTelecomCustomerInput extends Partial<CreateTelecomCustomerInput> {
  leadId: string;
  name: string;
}

export function useUpsertTelecomCustomerFromLead() {
  const queryClient = useQueryClient();
  const { organization } = useAuth();

  return useMutation({
    mutationFn: async ({ leadId, ...customerData }: UpsertTelecomCustomerInput) => {
      if (!organization?.id) throw new Error('Organização não encontrada');

      // Check if customer already exists for this lead
      const { data: existing } = await supabase
        .from('telecom_customers')
        .select('id')
        .eq('lead_id', leadId)
        .maybeSingle();

      if (existing) {
        // Update existing customer
        const { data, error } = await supabase
          .from('telecom_customers')
          .update(customerData)
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Create new customer linked to lead
        const { data, error } = await supabase
          .from('telecom_customers')
          .insert({
            organization_id: organization.id,
            lead_id: leadId,
            ...customerData,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['telecom-customer-by-lead', variables.leadId] });
      queryClient.invalidateQueries({ queryKey: ['telecom-customers'] });
      toast.success('Cliente salvo com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao salvar cliente: ${error.message}`);
    },
  });
}
