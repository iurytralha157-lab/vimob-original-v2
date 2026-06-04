import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface SiteMenuItem {
  id: string;
  organization_id: string;
  label: string;
  link_type: 'page' | 'filter' | 'external';
  href: string;
  position: number;
  open_in_new_tab: boolean;
  is_active: boolean;
  created_at: string;
}

export function useSiteMenuItems() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['site-menu-items', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_menu_items' as any)
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .order('position');
      
      if (error) throw error;
      return (data || []) as unknown as SiteMenuItem[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useCreateMenuItem() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  
  return useMutation({
    mutationFn: async (item: Omit<SiteMenuItem, 'id' | 'organization_id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('site_menu_items' as any)
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
      queryClient.invalidateQueries({ queryKey: ['site-menu-items'] });
      toast.success('Item de menu adicionado!');
    },
    onError: (error: any) => {
      toast.error('Erro ao adicionar item: ' + error.message);
    },
  });
}

export function useUpdateMenuItem() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SiteMenuItem> & { id: string }) => {
      const { data, error } = await supabase
        .from('site_menu_items' as any)
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-menu-items'] });
      toast.success('Item atualizado!');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar item: ' + error.message);
    },
  });
}

export function useDeleteMenuItem() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('site_menu_items' as any)
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-menu-items'] });
      toast.success('Item removido!');
    },
    onError: (error: any) => {
      toast.error('Erro ao remover item: ' + error.message);
    },
  });
}

export function useReorderMenuItems() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (items: { id: string; position: number }[]) => {
      const promises = items.map(({ id, position }) =>
        supabase
          .from('site_menu_items' as any)
          .update({ position })
          .eq('id', id)
      );
      
      const results = await Promise.all(promises);
      const error = results.find(r => r.error)?.error;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-menu-items'] });
    },
    onError: (error: any) => {
      toast.error('Erro ao reordenar: ' + error.message);
    },
  });
}
