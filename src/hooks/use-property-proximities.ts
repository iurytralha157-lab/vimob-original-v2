import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PropertyProximity {
  id: string;
  organization_id: string;
  name: string;
  icon: string | null;
  created_at: string;
}

const DEFAULT_PROXIMITIES = [
  'Escolas',
  'Universidades',
  'Hospitais',
  'Farmácias',
  'Supermercados',
  'Shoppings',
  'Bancos',
  'Transporte público',
  'Metrô / Trem',
  'Restaurantes',
  'Padarias',
  'Postos de gasolina',
  'Academia',
  'Parques',
];

export function usePropertyProximities() {
  return useQuery({
    queryKey: ['property-proximities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_proximities')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as PropertyProximity[];
    },
  });
}

export function useCreatePropertyProximity() {
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
        .from('property_proximities')
        .insert({
          name,
          organization_id: userData.organization_id,
        })
        .select()
        .single();
      
      if (error) {
        if (error.code === '23505') {
          throw new Error('Esta proximidade já existe');
        }
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-proximities'] });
      toast.success('Proximidade adicionada!');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useSeedDefaultProximities() {
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
      
      const proximities = DEFAULT_PROXIMITIES.map(name => ({
        name,
        organization_id: userData.organization_id,
      }));
      
      const { error } = await supabase
        .from('property_proximities')
        .upsert(proximities, { onConflict: 'organization_id,name', ignoreDuplicates: true });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-proximities'] });
    },
  });
}

export { DEFAULT_PROXIMITIES };
