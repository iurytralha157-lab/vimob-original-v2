import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Types
export interface PropertyCity {
  id: string;
  organization_id: string;
  name: string;
  uf: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PropertyNeighborhood {
  id: string;
  organization_id: string;
  city_id: string | null;
  name: string;
  is_active: boolean;
  created_at: string;
  city?: PropertyCity;
}

export interface PropertyCondominium {
  id: string;
  organization_id: string;
  city_id: string | null;
  neighborhood_id: string | null;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  created_at: string;
  city?: PropertyCity;
  neighborhood?: PropertyNeighborhood;
}

// Cities hooks
export function usePropertyCities() {
  return useQuery({
    queryKey: ['property-cities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_cities')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data as PropertyCity[];
    },
  });
}

export function useCreateCity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (city: { name: string; uf?: string }) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Não autenticado');

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.user.id)
        .single();

      if (!userData?.organization_id) throw new Error('Organização não encontrada');

      const { data, error } = await supabase
        .from('property_cities')
        .insert({
          organization_id: userData.organization_id,
          name: city.name,
          uf: city.uf || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-cities'] });
      toast.success('Cidade cadastrada!');
    },
    onError: (error) => {
      toast.error('Erro ao cadastrar cidade: ' + error.message);
    },
  });
}

export function useDeleteCity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('property_cities')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-cities'] });
      toast.success('Cidade excluída!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir cidade: ' + error.message);
    },
  });
}

// Neighborhoods hooks
export function usePropertyNeighborhoods(cityId?: string) {
  return useQuery({
    queryKey: ['property-neighborhoods', cityId],
    queryFn: async () => {
      let query = supabase
        .from('property_neighborhoods')
        .select('*, city:property_cities(*)')
        .eq('is_active', true)
        .order('name');

      if (cityId) {
        query = query.eq('city_id', cityId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as PropertyNeighborhood[];
    },
  });
}

export function useCreateNeighborhood() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (neighborhood: { name: string; city_id: string }) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Não autenticado');

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.user.id)
        .single();

      if (!userData?.organization_id) throw new Error('Organização não encontrada');

      const { data, error } = await supabase
        .from('property_neighborhoods')
        .insert({
          organization_id: userData.organization_id,
          name: neighborhood.name,
          city_id: neighborhood.city_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-neighborhoods'] });
      toast.success('Bairro cadastrado!');
    },
    onError: (error) => {
      toast.error('Erro ao cadastrar bairro: ' + error.message);
    },
  });
}

export function useDeleteNeighborhood() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('property_neighborhoods')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-neighborhoods'] });
      toast.success('Bairro excluído!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir bairro: ' + error.message);
    },
  });
}

// Condominiums hooks
export function usePropertyCondominiums(neighborhoodId?: string) {
  return useQuery({
    queryKey: ['property-condominiums', neighborhoodId],
    queryFn: async () => {
      let query = supabase
        .from('property_condominiums')
        .select('*, city:property_cities(*), neighborhood:property_neighborhoods(*)')
        .eq('is_active', true)
        .order('name');

      if (neighborhoodId) {
        query = query.eq('neighborhood_id', neighborhoodId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as PropertyCondominium[];
    },
  });
}

export function useCreateCondominium() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (condominium: { 
      name: string; 
      city_id?: string;
      neighborhood_id?: string;
      address?: string;
      latitude?: number;
      longitude?: number;
    }) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Não autenticado');

      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.user.id)
        .single();

      if (!userData?.organization_id) throw new Error('Organização não encontrada');

      const { data, error } = await supabase
        .from('property_condominiums')
        .insert({
          organization_id: userData.organization_id,
          name: condominium.name,
          city_id: condominium.city_id || null,
          neighborhood_id: condominium.neighborhood_id || null,
          address: condominium.address || null,
          latitude: condominium.latitude || null,
          longitude: condominium.longitude || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-condominiums'] });
      toast.success('Condomínio cadastrado!');
    },
    onError: (error) => {
      toast.error('Erro ao cadastrar condomínio: ' + error.message);
    },
  });
}

export function useDeleteCondominium() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('property_condominiums')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-condominiums'] });
      toast.success('Condomínio excluído!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir condomínio: ' + error.message);
    },
  });
}
