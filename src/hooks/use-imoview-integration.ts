import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function useImoviewIntegration() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['imoview-integration', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from('imoview_integrations' as any)
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!orgId,
  });
}

export function useSaveImoviewIntegration() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const orgId = profile?.organization_id;

  return useMutation({
    mutationFn: async ({ api_key }: { api_key: string }) => {
      if (!orgId) throw new Error('No organization');
      const { data, error } = await supabase
        .from('imoview_integrations' as any)
        .upsert(
          { organization_id: orgId, api_key, is_active: true } as any,
          { onConflict: 'organization_id' }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imoview-integration'] });
      toast.success('Integração Imoview salva!');
    },
    onError: (e: any) => toast.error(`Erro ao salvar: ${e.message}`),
  });
}

export function useTestImoviewConnection() {
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('imoview-sync', {
        body: { action: 'test', organization_id: profile?.organization_id },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useSyncImoviewProperties() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('imoview-sync', {
        body: { action: 'sync', organization_id: profile?.organization_id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['imoview-integration'] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      toast.success(`Sincronização concluída! ${data.synced} imóveis importados.`);
    },
    onError: (e: any) => toast.error(`Erro na sincronização: ${e.message}`),
  });
}

export function useDeleteImoviewIntegration() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!profile?.organization_id) throw new Error('No org');
      const { error } = await supabase
        .from('imoview_integrations' as any)
        .delete()
        .eq('organization_id', profile.organization_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imoview-integration'] });
      toast.success('Integração removida!');
    },
  });
}
