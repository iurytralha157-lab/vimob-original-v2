import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PropertyType {
  id: string;
  name: string;
  organization_id: string;
  created_at: string;
}

const defaultTypes = [
  'Apartamento',
  'Casa',
  'Cobertura',
  'Comercial',
  'Terreno',
  'Kitnet',
  'Flat',
  'Fazenda',
  'Sítio',
  'Galpão',
];

export function usePropertyTypes() {
  return useQuery({
    queryKey: ['property-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_types')
        .select('*')
        .order('name');
      
      if (error) throw error;
      
      // Combine default types with custom ones
      const customNames = (data || []).map(t => t.name);
      const allTypes = [...new Set([...defaultTypes, ...customNames])].sort();
      
      return allTypes;
    },
  });
}

export function useCreatePropertyType() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (name: string) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Não autenticado');
      
      const { data: profile } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', userData.user.id)
        .single();
      
      if (!profile?.organization_id) throw new Error('Organização não encontrada');
      
      const { data, error } = await supabase
        .from('property_types')
        .insert({
          name,
          organization_id: profile.organization_id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-types'] });
      toast.success('Tipo de imóvel adicionado!');
    },
    onError: (error) => {
      toast.error('Erro ao adicionar tipo: ' + error.message);
    },
  });
}
