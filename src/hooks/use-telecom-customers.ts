import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface TelecomCustomer {
  id: string;
  organization_id: string;
  external_id: string | null;
  name: string;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  cpf_cnpj: string | null;
  rg: string | null;
  birth_date: string | null;
  mother_name: string | null;
  address: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  uf: string | null;
  cep: string | null;
  plan_id: string | null;
  plan_code: string | null;
  contracted_plan: string | null;
  plan_value: number | null;
  due_day: number | null;
  payment_method: string | null;
  seller_id: string | null;
  status: string;
  installation_date: string | null;
  contract_date: string | null;
  chip_category: string | null;
  chip_quantity: number | null;
  mesh_repeater: string | null;
  mesh_quantity: number | null;
  is_combo: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined relations
  plan?: {
    id: string;
    name: string;
    code: string;
    price: number;
  } | null;
  seller?: {
    id: string;
    name: string;
  } | null;
}

export interface CreateTelecomCustomerInput {
  external_id?: string | null;
  name: string;
  phone?: string | null;
  phone2?: string | null;
  is_portability?: boolean;
  email?: string | null;
  cpf_cnpj?: string | null;
  rg?: string | null;
  birth_date?: string | null;
  mother_name?: string | null;
  address?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  uf?: string | null;
  cep?: string | null;
  plan_id?: string | null;
  plan_code?: string | null;
  contracted_plan?: string | null;
  plan_value?: number | null;
  due_day?: number | null;
  payment_method?: string | null;
  seller_id?: string | null;
  status?: string;
  installation_date?: string | null;
  contract_date?: string | null;
  chip_category?: string | null;
  chip_quantity?: number | null;
  mesh_repeater?: string | null;
  mesh_quantity?: number | null;
  is_combo?: boolean;
  notes?: string | null;
}

export const CHIP_CATEGORIES = [
  { value: 'CONVENCIONAL', label: 'Convencional' },
  { value: 'PROMOCIONAL', label: 'Promocional' },
  { value: 'SEM_CHIP', label: 'Sem Chip' },
] as const;

export const MESH_REPEATER_OPTIONS = [
  { value: 'NO_ATO', label: 'No Ato' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'SEM_REPETIDOR', label: 'Sem Repetidor' },
] as const;

export const PAYMENT_METHODS = [
  { value: 'credit_card', label: 'Cartão de Crédito' },
  { value: 'debit_card', label: 'Cartão de Débito' },
  { value: 'pix_auto', label: 'Pix Automático' },
  { value: 'boleto_pix', label: 'Boleto ou Pix' },
] as const;

export const DUE_DAY_OPTIONS = [1, 3, 5, 9, 13, 18] as const;

export const TELECOM_CUSTOMER_STATUSES = [
  { value: 'NOVO', label: 'Novo', color: 'bg-blue-500' },
  { value: 'INSTALADOS', label: 'Instalado', color: 'bg-green-500' },
  { value: 'AGUARDANDO', label: 'Aguardando', color: 'bg-yellow-500' },
  { value: 'EM_ANALISE', label: 'Em Análise', color: 'bg-purple-500' },
  { value: 'CANCELADO', label: 'Cancelado', color: 'bg-red-500' },
  { value: 'SUSPENSO', label: 'Suspenso', color: 'bg-orange-500' },
  { value: 'INADIMPLENTE', label: 'Inadimplente', color: 'bg-red-400' },
] as const;

export function useTelecomCustomers(filters?: {
  status?: string;
  search?: string;
  plan_id?: string;
  page?: number;
  limit?: number;
  // Permission-based filtering
  canViewAll?: boolean;
  currentUserId?: string;
}) {
  const { organization } = useAuth();
  const page = filters?.page || 1;
  const limit = filters?.limit || 30;
  const offset = (page - 1) * limit;

  // Determine if we should filter by seller_id
  // Only filter if canViewAll is explicitly false AND we have a user ID
  const shouldFilterBySeller = filters?.canViewAll === false && !!filters?.currentUserId;

  return useQuery({
    queryKey: ['telecom-customers', organization?.id, filters?.status, filters?.search, filters?.plan_id, page, limit, shouldFilterBySeller, filters?.currentUserId],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      let query = supabase
        .from('telecom_customers')
        .select(`
          *,
          plan:service_plans(id, name, code, price),
          seller:users!telecom_customers_seller_id_fkey(id, name)
        `)
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      // Permission-based filtering: if user doesn't have view_all permission, filter by seller_id
      if (shouldFilterBySeller) {
        query = query.eq('seller_id', filters!.currentUserId!);
      }

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.plan_id) {
        query = query.eq('plan_id', filters.plan_id);
      }

      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,email.ilike.%${filters.search}%,cpf_cnpj.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as TelecomCustomer[];
    },
    enabled: !!organization?.id,
  });
}

// Hook separado para contar estatísticas usando queries de contagem (sem limite de 1000)
export function useTelecomCustomerStats(filters?: {
  canViewAll?: boolean;
  currentUserId?: string;
}) {
  const { organization } = useAuth();

  // Determine if we should filter by seller_id
  const shouldFilterBySeller = filters?.canViewAll === false && !!filters?.currentUserId;

  return useQuery({
    queryKey: ['telecom-customer-stats', organization?.id, shouldFilterBySeller, filters?.currentUserId],
    queryFn: async () => {
      if (!organization?.id) {
        return {
          total: 0,
          instalados: 0,
          cancelados: 0,
          aguardando: 0,
          inadimplentes: 0,
        };
      }

      // Base query builder that applies permission filtering
      const buildQuery = (status?: string) => {
        let query = supabase
          .from('telecom_customers')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', organization.id);
        
        // Permission-based filtering: if user doesn't have view_all permission, filter by seller_id
        if (shouldFilterBySeller) {
          query = query.eq('seller_id', filters!.currentUserId!);
        }
        
        if (status) {
          query = query.eq('status', status);
        }
        
        return query;
      };

      // Usar count para evitar limite de 1000 rows
      const [
        { count: total },
        { count: instalados },
        { count: cancelados },
        { count: aguardando },
        { count: inadimplentes },
      ] = await Promise.all([
        buildQuery(),
        buildQuery('INSTALADOS'),
        buildQuery('CANCELADO'),
        buildQuery('AGUARDANDO'),
        buildQuery('INADIMPLENTE'),
      ]);

      return {
        total: total || 0,
        instalados: instalados || 0,
        cancelados: cancelados || 0,
        aguardando: aguardando || 0,
        inadimplentes: inadimplentes || 0,
      };
    },
    enabled: !!organization?.id,
  });
}

export function useCreateTelecomCustomer() {
  const queryClient = useQueryClient();
  const { organization } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateTelecomCustomerInput) => {
      if (!organization?.id) throw new Error('Organização não encontrada');

      const { data, error } = await supabase
        .from('telecom_customers')
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
      queryClient.invalidateQueries({ queryKey: ['telecom-customers'] });
      toast.success('Cliente cadastrado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao cadastrar cliente: ${error.message}`);
    },
  });
}

export function useUpdateTelecomCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<TelecomCustomer> & { id: string }) => {
      const { data, error } = await supabase
        .from('telecom_customers')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telecom-customers'] });
      toast.success('Cliente atualizado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar cliente: ${error.message}`);
    },
  });
}

export function useDeleteTelecomCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('telecom_customers')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telecom-customers'] });
      toast.success('Cliente excluído com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao excluir cliente: ${error.message}`);
    },
  });
}
