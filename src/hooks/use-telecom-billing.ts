import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface TelecomBilling {
  id: string;
  organization_id: string;
  customer_id: string;
  billing_month: string;
  billing_status: string | null;
  payment_status: string | null;
  amount: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  customer?: {
    id: string;
    name: string;
    phone: string | null;
    plan_value: number | null;
  };
}

export interface CreateTelecomBillingInput {
  customer_id: string;
  billing_month: string;
  billing_status?: string;
  payment_status?: string;
  amount?: number | null;
  notes?: string | null;
}

export const BILLING_STATUS_OPTIONS = [
  { value: 'COBRADO', label: 'Cobrado', color: 'bg-green-500' },
  { value: 'NAO_COBRADO', label: 'Não Cobrado', color: 'bg-gray-500' },
] as const;

export const PAYMENT_STATUS_OPTIONS = [
  { value: 'PENDENTE', label: 'Pendente', color: 'bg-yellow-500' },
  { value: 'PAGO', label: 'Pago', color: 'bg-green-500' },
  { value: 'VENCIDO', label: 'Vencido', color: 'bg-red-500' },
  { value: 'RENEGOCIADO', label: 'Renegociado', color: 'bg-purple-500' },
  { value: 'CHURN', label: 'Churn', color: 'bg-orange-500' },
  { value: 'CANCELADO', label: 'Cancelado', color: 'bg-gray-700' },
] as const;

export function useTelecomBilling(filters?: {
  billing_month?: string;
  payment_status?: string;
  customer_id?: string;
}) {
  const { organization } = useAuth();

  return useQuery({
    queryKey: ['telecom-billing', organization?.id, filters],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      let query = supabase
        .from('telecom_billing')
        .select(`
          *,
          customer:telecom_customers(id, name, phone, plan_value)
        `)
        .eq('organization_id', organization.id)
        .order('billing_month', { ascending: false });

      if (filters?.billing_month) {
        query = query.eq('billing_month', filters.billing_month);
      }

      if (filters?.payment_status) {
        query = query.eq('payment_status', filters.payment_status);
      }

      if (filters?.customer_id) {
        query = query.eq('customer_id', filters.customer_id);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as TelecomBilling[];
    },
    enabled: !!organization?.id,
  });
}

export function useCreateTelecomBilling() {
  const queryClient = useQueryClient();
  const { organization } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateTelecomBillingInput) => {
      if (!organization?.id) throw new Error('Organização não encontrada');

      const { data, error } = await supabase
        .from('telecom_billing')
        .insert({
          organization_id: organization.id,
          ...input,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telecom-billing'] });
      toast.success('Cobrança registrada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao registrar cobrança: ${error.message}`);
    },
  });
}

export function useUpdateTelecomBilling() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<TelecomBilling> & { id: string }) => {
      const { data, error } = await supabase
        .from('telecom_billing')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telecom-billing'] });
      toast.success('Cobrança atualizada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar cobrança: ${error.message}`);
    },
  });
}

export function useBulkCreateBilling() {
  const queryClient = useQueryClient();
  const { organization } = useAuth();

  return useMutation({
    mutationFn: async (inputs: CreateTelecomBillingInput[]) => {
      if (!organization?.id) throw new Error('Organização não encontrada');

      const records = inputs.map(input => ({
        organization_id: organization.id,
        ...input,
      }));

      const { data, error } = await supabase
        .from('telecom_billing')
        .upsert(records, { 
          onConflict: 'customer_id,billing_month',
          ignoreDuplicates: true 
        })
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['telecom-billing'] });
      toast.success(`${data?.length || 0} cobranças registradas!`);
    },
    onError: (error: Error) => {
      toast.error(`Erro ao registrar cobranças: ${error.message}`);
    },
  });
}
