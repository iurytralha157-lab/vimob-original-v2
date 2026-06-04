import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PropertyFeature {
  id: string;
  organization_id: string;
  name: string;
  icon: string | null;
  created_at: string | null;
}

const DEFAULT_FEATURES = [
  'Sala de jantar',
  'Cozinha',
  'Escritório',
  'Lavanderia',
  'Despensa',
  'Lavabo',
  'Área de churrasco',
  'Jardim',
  'Piscina',
  'Varanda',
  'Sacada',
  'Closet',
  'Home office',
  'Sala de estar',
  'Quintal',
  'Edícula',
];

export function usePropertyFeatures() {
  return useQuery({
    queryKey: ['property-features'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_features')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return (data || []) as PropertyFeature[];
    },
  });
}

export function useCreatePropertyFeature() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (name: string) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Usuário não autenticado');
      
      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.user.id)
        .single();
      
      if (!userData?.organization_id) throw new Error('Organização não encontrada');
      
      const { data, error } = await supabase
        .from('property_features')
        .insert({
          name,
          organization_id: userData.organization_id,
        })
        .select()
        .single();
      
      if (error) {
        if (error.code === '23505') {
          throw new Error('Esta característica já existe');
        }
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-features'] });
      toast.success('Característica adicionada!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useSeedDefaultFeatures() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Usuário não autenticado');
      
      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.user.id)
        .single();
      
      if (!userData?.organization_id) throw new Error('Organização não encontrada');
      
      const features = DEFAULT_FEATURES.map(name => ({
        name,
        organization_id: userData.organization_id,
      }));
      
      const { error } = await supabase
        .from('property_features')
        .upsert(features, { onConflict: 'organization_id,name', ignoreDuplicates: true });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-features'] });
    },
  });
}

export { DEFAULT_FEATURES };
