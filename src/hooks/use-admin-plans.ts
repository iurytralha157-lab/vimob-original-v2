import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  billing_cycle: string;
  trial_enabled: boolean | null;
  trial_days: number;
  max_users: number;
  max_whatsapp_sessions: number | null;
  max_leads: number | null;
  modules: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useAdminPlans() {
  const queryClient = useQueryClient();

  const { data: plans, isLoading } = useQuery({
    queryKey: ['admin-subscription-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_subscription_plans')
        .select('*')
        .order('price', { ascending: true });

      if (error) throw error;
      return data as SubscriptionPlan[];
    },
  });

  const createPlan = useMutation({
    mutationFn: async (plan: Omit<SubscriptionPlan, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('admin_subscription_plans')
        .insert(plan)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Plano criado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['admin-subscription-plans'] });
    },
    onError: (error) => {
      toast.error('Erro ao criar plano: ' + error.message);
    },
  });

  const updatePlan = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SubscriptionPlan> & { id: string }) => {
      const { error } = await supabase
        .from('admin_subscription_plans')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Plano atualizado!');
      queryClient.invalidateQueries({ queryKey: ['admin-subscription-plans'] });
    },
    onError: (error) => {
      toast.error('Erro ao atualizar plano: ' + error.message);
    },
  });

  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('admin_subscription_plans')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Plano excluído!');
      queryClient.invalidateQueries({ queryKey: ['admin-subscription-plans'] });
    },
    onError: (error) => {
      toast.error('Erro ao excluir plano: ' + error.message);
    },
  });

  return {
    plans,
    isLoading,
    createPlan,
    updatePlan,
    deletePlan,
  };
}
