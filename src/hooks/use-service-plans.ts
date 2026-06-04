import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface ServicePlan {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  category: 'PF' | 'PJ' | 'MOVEL' | 'ADICIONAL';
  price: number | null;
  speed_mb: number | null;
  description: string | null;
  features: string[];
  is_active: boolean;
  is_promo: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateServicePlanInput {
  code: string;
  name: string;
  category: 'PF' | 'PJ' | 'MOVEL' | 'ADICIONAL';
  price?: number | null;
  speed_mb?: number | null;
  description?: string | null;
  features?: string[];
  is_active?: boolean;
  is_promo?: boolean;
}

export function useServicePlans() {
  const { organization } = useAuth();

  return useQuery({
    queryKey: ['service-plans', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      const { data, error } = await supabase
        .from('service_plans')
        .select('*')
        .eq('organization_id', organization.id)
        .order('category', { ascending: true })
        .order('code', { ascending: true });

      if (error) throw error;
      return data as ServicePlan[];
    },
    enabled: !!organization?.id,
  });
}

export function useCreateServicePlan() {
  const queryClient = useQueryClient();
  const { organization } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateServicePlanInput) => {
      if (!organization?.id) throw new Error('Organização não encontrada');

      const { data, error } = await supabase
        .from('service_plans')
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
      queryClient.invalidateQueries({ queryKey: ['service-plans'] });
      toast.success('Plano criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar plano: ${error.message}`);
    },
  });
}

export function useUpdateServicePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<ServicePlan> & { id: string }) => {
      const { data, error } = await supabase
        .from('service_plans')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-plans'] });
      toast.success('Plano atualizado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar plano: ${error.message}`);
    },
  });
}

export function useDeleteServicePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('service_plans')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-plans'] });
      toast.success('Plano excluído com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao excluir plano: ${error.message}`);
    },
  });
}
