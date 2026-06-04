import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function useVistaIntegration() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['vista-integration', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from('vista_integrations')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });
}

export function useSaveVistaIntegration() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const orgId = profile?.organization_id;

  return useMutation({
    mutationFn: async ({ api_url, api_key }: { api_url: string; api_key: string }) => {
      if (!orgId) throw new Error('No organization');
      const { data, error } = await supabase
        .from('vista_integrations')
        .upsert(
          { organization_id: orgId, api_url, api_key, is_active: true },
          { onConflict: 'organization_id' }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vista-integration'] });
      toast.success('Integração Vista salva!');
    },
    onError: (e: any) => toast.error(`Erro ao salvar: ${e.message}`),
  });
}

export function useTestVistaConnection() {
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('vista-sync', {
        body: { action: 'test', organization_id: profile?.organization_id },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useSyncVistaProperties() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('vista-sync', {
        body: { action: 'sync', organization_id: profile?.organization_id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['vista-integration'] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      toast.success(`Sincronização concluída! ${data.synced} imóveis importados.`);
    },
    onError: (e: any) => toast.error(`Erro na sincronização: ${e.message}`),
  });
}

export function useDeleteVistaIntegration() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!profile?.organization_id) throw new Error('No org');
      const { error } = await supabase
        .from('vista_integrations')
        .delete()
        .eq('organization_id', profile.organization_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vista-integration'] });
      toast.success('Integração removida!');
    },
  });
}
