import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface SiteSearchFilter {
  id: string;
  organization_id: string;
  filter_key: string;
  label: string;
  position: number;
  is_active: boolean;
  created_at: string;
}

export const AVAILABLE_FILTERS = [
  { key: 'search', label: 'Busca por texto', defaultLabel: 'Buscar' },
  { key: 'tipo', label: 'Tipo de imóvel', defaultLabel: 'Tipo de Imóvel' },
  { key: 'finalidade', label: 'Finalidade (Venda/Aluguel)', defaultLabel: 'Finalidade' },
  { key: 'cidade', label: 'Cidade', defaultLabel: 'Cidade' },
  { key: 'bairro', label: 'Bairro', defaultLabel: 'Bairro' },
  { key: 'quartos', label: 'Quartos', defaultLabel: 'Quartos' },
  { key: 'suites', label: 'Suítes', defaultLabel: 'Suítes' },
  { key: 'banheiros', label: 'Banheiros', defaultLabel: 'Banheiros' },
  { key: 'vagas', label: 'Vagas de garagem', defaultLabel: 'Vagas' },
  { key: 'mobilia', label: 'Mobília', defaultLabel: 'Mobília' },
  { key: 'preco', label: 'Faixa de preço', defaultLabel: 'Faixa de Preço' },
] as const;

export function useSiteSearchFilters() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['site-search-filters', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_search_filters' as any)
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .order('position');

      if (error) throw error;
      return (data || []) as unknown as SiteSearchFilter[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useCreateSearchFilter() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (item: Pick<SiteSearchFilter, 'filter_key' | 'label' | 'position' | 'is_active'>) => {
      const { data, error } = await supabase
        .from('site_search_filters' as any)
        .insert({
          ...item,
          organization_id: profile!.organization_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-search-filters'] });
      toast.success('Filtro adicionado!');
    },
    onError: (error: any) => {
      toast.error('Erro ao adicionar filtro: ' + error.message);
    },
  });
}

export function useUpdateSearchFilter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SiteSearchFilter> & { id: string }) => {
      const { data, error } = await supabase
        .from('site_search_filters' as any)
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-search-filters'] });
      toast.success('Filtro atualizado!');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar filtro: ' + error.message);
    },
  });
}

export function useDeleteSearchFilter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('site_search_filters' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-search-filters'] });
      toast.success('Filtro removido!');
    },
    onError: (error: any) => {
      toast.error('Erro ao remover filtro: ' + error.message);
    },
  });
}

export function useReorderSearchFilters() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (items: { id: string; position: number }[]) => {
      const promises = items.map(({ id, position }) =>
        supabase
          .from('site_search_filters' as any)
          .update({ position })
          .eq('id', id)
      );

      const results = await Promise.all(promises);
      const error = results.find(r => r.error)?.error;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-search-filters'] });
    },
    onError: (error: any) => {
      toast.error('Erro ao reordenar: ' + error.message);
    },
  });
}
