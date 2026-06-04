import { keepPreviousData, useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Tables } from '@/integrations/supabase/types';
import { removeDemoProperties } from '@/lib/demo-properties';

export type Property = Tables<'properties'>;

// Campos otimizados para listagem (evita SELECT *)
const PROPERTY_LIST_FIELDS = `
  id, code, title, tipo_de_imovel, tipo_de_negocio, 
  status, destaque, bairro, cidade, uf,
  quartos, banheiros, vagas, area_util, area_total, preco, valor_locacao, 
  imagem_principal, created_at, organization_id,
  commission_percentage, cadastrado_por
`;

export function useProperties(search?: string) {
  return useQuery({
    queryKey: ['properties', search],
    queryFn: async () => {
      let query = supabase
        .from('properties')
        .select(PROPERTY_LIST_FIELDS)
        .order('created_at', { ascending: false })
        .limit(1000);
      
      if (search) {
        query = query.or(`code.ilike.%${search}%,title.ilike.%${search}%,bairro.ilike.%${search}%,cidade.ilike.%${search}%,uf.ilike.%${search}%,tipo_de_imovel.ilike.%${search}%,tipo_de_negocio.ilike.%${search}%,vista_codigo.ilike.%${search}%,imoview_codigo.ilike.%${search}%`);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as Property[];
    },
  });
}

export function useInfiniteProperties(search?: string, pageSize: number = 24) {
  const normalizedSearch = search?.trim() || undefined;

  return useInfiniteQuery({
    queryKey: ['properties-infinite', normalizedSearch, pageSize],
    queryFn: async ({ pageParam = 0 }) => {
      let query = supabase
        .from('properties')
        .select(PROPERTY_LIST_FIELDS, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(pageParam * pageSize, (pageParam + 1) * pageSize - 1);
      
      if (normalizedSearch) {
        query = query.or(`code.ilike.%${normalizedSearch}%,title.ilike.%${normalizedSearch}%,bairro.ilike.%${normalizedSearch}%,cidade.ilike.%${normalizedSearch}%,uf.ilike.%${normalizedSearch}%,tipo_de_imovel.ilike.%${normalizedSearch}%,tipo_de_negocio.ilike.%${normalizedSearch}%,vista_codigo.ilike.%${normalizedSearch}%,imoview_codigo.ilike.%${normalizedSearch}%`);
      }
      
      const { data, error, count } = await query;
      
      if (error) throw error;
      return {
        properties: data as Property[],
        nextPage: data.length === pageSize ? pageParam + 1 : undefined,
        totalCount: count || 0
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    placeholderData: keepPreviousData,
  });
}

export function useProperty(id: string | null) {
  return useQuery({
    queryKey: ['property', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data as Property;
    },
    enabled: !!id,
    staleTime: 0,
  });
}

async function generatePropertyCode(organizationId: string, tipoImovel: string): Promise<string> {
  const prefixMap: Record<string, string> = {
    'Casa': 'CA',
    'Apartamento': 'AP',
    'Cobertura': 'AP',
    'Kitnet': 'AP',
    'Flat': 'AP',
    'Loft': 'AP',
    'Studio': 'AP',
    'Comercial': 'CO',
    'Sala Comercial': 'CO',
    'Loja': 'CO',
    'Galpão': 'GA',
    'Terreno': 'TR',
    'Lote': 'TR',
    'Sítio': 'SI',
    'Chácara': 'SI',
    'Fazenda': 'FA',
    'Sobrado': 'CA',
    'Condomínio': 'CA',
  };
  const prefix = prefixMap[tipoImovel] || 'IM';
  
  const { data: seq } = await supabase
    .from('property_sequences')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('prefix', prefix)
    .single();
  
  let nextNumber = 1;
  
  if (seq) {
    nextNumber = (seq.last_number || 0) + 1;
    await supabase
      .from('property_sequences')
      .update({ last_number: nextNumber })
      .eq('id', seq.id);
  } else {
    await supabase
      .from('property_sequences')
      .insert({ organization_id: organizationId, prefix, last_number: 1 });
  }
  
  return `${prefix}${String(nextNumber).padStart(4, '0')}`;
}

export function useCreateProperty() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (propertyInput: Omit<Partial<Property>, 'id' | 'code' | 'organization_id' | 'created_at' | 'updated_at'>) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Usuário não autenticado');
      
      // Check if impersonating
      const impersonating = localStorage.getItem('impersonating');
      let organizationId: string | null = null;
      
      if (impersonating) {
        const session = JSON.parse(impersonating);
        organizationId = session.orgId;
      } else {
        const { data: userData } = await supabase
          .from('users')
          .select('organization_id')
          .eq('id', user.user.id)
          .single();
        organizationId = userData?.organization_id || null;
      }
      
      if (!organizationId) throw new Error('Organização não encontrada');
      
      const code = await generatePropertyCode(organizationId, propertyInput.tipo_de_imovel || 'Apartamento');
      
      const { data, error } = await supabase
        .from('properties')
        .insert({
          ...propertyInput,
          code,
          organization_id: organizationId,
        })
        .select()
        .single();
      
      if (error) throw error;

      // Log activity: property created (for gamification)
      await supabase.from('activities').insert({
        user_id: user.user.id,
        lead_id: '00000000-0000-0000-0000-000000000000', // Placeholder for non-lead activities
        type: 'property_created',
        content: `Imóvel "${data.title}" (Cód: ${data.code}) foi captado`,
        metadata: { property_id: data.id, code: data.code }
      });
      return data;
    },
    onSuccess: (data) => {
      // Remove demo properties when user creates their first real property
      if (data?.organization_id) {
        removeDemoProperties(data.organization_id);
      }
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      toast.success('Imóvel cadastrado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao cadastrar imóvel: ' + error.message);
    },
  });
}

export function useUpdateProperty() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Property> & { id: string }) => {
      // Se o tipo de imóvel mudou, regenerar o código
      if (updates.tipo_de_imovel) {
        const { data: current, error: fetchErr } = await supabase
          .from('properties')
          .select('tipo_de_imovel, organization_id, code')
          .eq('id', id)
          .single();
        
        console.log('[useUpdateProperty] Current property:', current, 'New tipo:', updates.tipo_de_imovel);
        
        if (fetchErr) {
          console.error('[useUpdateProperty] Error fetching current property:', fetchErr);
        }
        
        if (current && current.tipo_de_imovel !== updates.tipo_de_imovel && current.organization_id) {
          const newCode = await generatePropertyCode(current.organization_id, updates.tipo_de_imovel);
          console.log('[useUpdateProperty] Code changed from', current.code, 'to', newCode);
          updates.code = newCode;
        }
      }

      const { data, error } = await supabase
        .from('properties')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['property', variables.id] });
      toast.success('Imóvel atualizado!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar imóvel: ' + error.message);
    },
  });
}

export function useDeleteProperty() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('properties')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      toast.success('Imóvel excluído!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir imóvel: ' + error.message);
    },
  });
}
