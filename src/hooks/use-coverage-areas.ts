import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface CoverageArea {
  id: string;
  organization_id: string;
  uf: string;
  city: string;
  neighborhood: string;
  zone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCoverageAreaInput {
  uf: string;
  city: string;
  neighborhood: string;
  zone?: string | null;
  is_active?: boolean;
}

export function useCoverageAreas() {
  const { organization } = useAuth();

  return useQuery({
    queryKey: ['coverage-areas', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      const { data, error } = await supabase
        .from('coverage_areas')
        .select('*')
        .eq('organization_id', organization.id)
        .order('uf', { ascending: true })
        .order('city', { ascending: true })
        .order('neighborhood', { ascending: true });

      if (error) throw error;
      return data as CoverageArea[];
    },
    enabled: !!organization?.id,
  });
}

// Hook para obter UFs distintas
export function useCoverageUFs() {
  const { data: areas = [] } = useCoverageAreas();
  
  const ufs = [...new Set(areas.map(a => a.uf))].sort();
  return ufs;
}

// Hook para obter cidades de uma UF
export function useCoverageCities(uf: string) {
  const { data: areas = [] } = useCoverageAreas();
  
  const cities = [...new Set(
    areas
      .filter(a => a.uf === uf)
      .map(a => a.city)
  )].sort();
  
  return cities;
}

// Hook para obter bairros de uma cidade
export function useCoverageNeighborhoods(uf: string, city: string) {
  const { data: areas = [] } = useCoverageAreas();
  
  const neighborhoods = areas
    .filter(a => a.uf === uf && a.city === city && a.is_active)
    .map(a => a.neighborhood)
    .sort();
  
  return neighborhoods;
}

export function useCreateCoverageArea() {
  const queryClient = useQueryClient();
  const { organization } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateCoverageAreaInput) => {
      if (!organization?.id) throw new Error('Organização não encontrada');

      const { data, error } = await supabase
        .from('coverage_areas')
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
      queryClient.invalidateQueries({ queryKey: ['coverage-areas'] });
      toast.success('Localidade adicionada com sucesso!');
    },
    onError: (error: Error) => {
      if (error.message.includes('duplicate')) {
        toast.error('Esta localidade já está cadastrada');
      } else {
        toast.error(`Erro ao adicionar localidade: ${error.message}`);
      }
    },
  });
}

export function useCreateCoverageAreasBatch() {
  const queryClient = useQueryClient();
  const { organization } = useAuth();

  return useMutation({
    mutationFn: async (inputs: CreateCoverageAreaInput[]) => {
      if (!organization?.id) throw new Error('Organização não encontrada');

      const records = inputs.map(input => ({
        organization_id: organization.id,
        ...input,
      }));

      const { data, error } = await supabase
        .from('coverage_areas')
        .upsert(records, { 
          onConflict: 'organization_id,uf,city,neighborhood',
          ignoreDuplicates: true 
        })
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['coverage-areas'] });
      toast.success(`${data?.length || 0} localidades importadas com sucesso!`);
    },
    onError: (error: Error) => {
      toast.error(`Erro ao importar localidades: ${error.message}`);
    },
  });
}

export function useUpdateCoverageArea() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<CoverageArea> & { id: string }) => {
      const { data, error } = await supabase
        .from('coverage_areas')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverage-areas'] });
      toast.success('Localidade atualizada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar localidade: ${error.message}`);
    },
  });
}

export function useDeleteCoverageArea() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('coverage_areas')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverage-areas'] });
      toast.success('Localidade removida com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao remover localidade: ${error.message}`);
    },
  });
}
