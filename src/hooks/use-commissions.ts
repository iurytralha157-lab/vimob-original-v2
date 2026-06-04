import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { logAuditAction } from "./use-audit-logs";
export interface CommissionRule {
  id: string;
  organization_id: string;
  name: string;
  business_type: 'sale' | 'rental' | 'service' | 'all';
  commission_type: 'percentage' | 'fixed';
  commission_value: number;
  is_active: boolean;
  created_at: string;
}

export interface Commission {
  id: string;
  organization_id: string;
  contract_id?: string;
  user_id: string;
  property_id?: string;
  rule_id?: string;
  base_value: number;
  percentage?: number;
  calculated_value: number;
  status: 'forecast' | 'pending' | 'approved' | 'paid' | 'cancelled';
  forecast_date?: string;
  approved_at?: string;
  approved_by?: string;
  paid_at?: string;
  paid_by?: string;
  payment_proof?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  user?: { id: string; name: string; email: string };
  contract?: { contract_number: string; client_name: string };
  property?: { code: string; title: string };
}

export function useCommissionRules() {
  const { profile, organization } = useAuth();
  const organizationId = organization?.id || profile?.organization_id;

  return useQuery({
    queryKey: ['commission-rules', organizationId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('commission_rules')
        .select('*')
        .eq('organization_id', organizationId)
        .order('name');

      if (error) throw error;
      return data as CommissionRule[];
    },
    enabled: !!organizationId,
  });
}

export function useCreateCommissionRule() {
  const queryClient = useQueryClient();
  const { profile, organization } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: Partial<CommissionRule>) => {
      const organizationId = organization?.id || profile?.organization_id;
      const { data: result, error } = await (supabase as any)
        .from('commission_rules')
        .insert({
          ...data,
          percentage: data.commission_type === 'percentage' ? data.commission_value : 0,
          organization_id: organizationId,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-rules'] });
      toast({ title: "Regra de comissão criada com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar regra", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateCommissionRule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<CommissionRule> & { id: string }) => {
      const payload = {
        ...data,
        percentage: data.commission_type === 'percentage' ? data.commission_value : 0,
      };
      const { data: result, error } = await (supabase as any)
        .from('commission_rules')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-rules'] });
      toast({ title: "Regra atualizada com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar regra", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteCommissionRule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('commission_rules')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-rules'] });
      toast({ title: "Regra excluída com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir regra", description: error.message, variant: "destructive" });
    },
  });
}

export function useCommissions(filters?: { status?: string; userId?: string }) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['commissions', profile?.organization_id, filters],
    queryFn: async () => {
      if (!profile?.organization_id) return [];

      let query = supabase
        .from('commissions')
        .select(`
          *,
          contract:contracts(contract_number, client_name),
          property:properties(code, title)
        `)
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.userId) {
        query = query.eq('user_id', filters.userId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch user details for each commission
      const commissionsTyped = data as unknown as Commission[];
      const commissionsWithUsers = await Promise.all(
        commissionsTyped.map(async (commission) => {
          const { data: user } = await supabase
            .from('users')
            .select('id, name, email')
            .eq('id', commission.user_id)
            .single();
          
          // Garantir que calculated_value existe (fallback para amount se necessário)
          const calculatedValue = (commission as any).amount ?? commission.calculated_value ?? 0;
          
          return { ...commission, user, calculated_value: calculatedValue };
        })
      );

      return commissionsWithUsers as Commission[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useApproveCommission() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: result, error } = await supabase
        .from('commissions')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: user?.id,
        } as never)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Audit log: commission approved
      logAuditAction(
        'approve',
        'commission',
        id,
        { status: 'pending' },
        { status: 'approved', approved_by: user?.id }
      ).catch(console.error);

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['financial-dashboard'] });
      toast({ title: "Comissão aprovada com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao aprovar comissão", description: error.message, variant: "destructive" });
    },
  });
}

export function usePayCommission() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, payment_proof }: { id: string; payment_proof?: string }) => {
      const { data: result, error } = await supabase
        .from('commissions')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          paid_by: user?.id,
          payment_proof,
        } as never)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Audit log: commission paid
      logAuditAction(
        'pay',
        'commission',
        id,
        { status: 'approved' },
        { status: 'paid', paid_by: user?.id }
      ).catch(console.error);

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['financial-dashboard'] });
      toast({ title: "Pagamento de comissão registrado" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao registrar pagamento", description: error.message, variant: "destructive" });
    },
  });
}

export function useCancelCommission() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      // Get old status for audit
      const { data: oldCommission } = await supabase
        .from('commissions')
        .select('status')
        .eq('id', id)
        .single();

      const { data: result, error } = await supabase
        .from('commissions')
        .update({
          status: 'cancelled',
          notes,
        } as never)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Audit log: commission cancelled
      logAuditAction(
        'cancel',
        'commission',
        id,
        { status: (oldCommission as any)?.status },
        { status: 'cancelled', notes }
      ).catch(console.error);

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['financial-dashboard'] });
      toast({ title: "Comissão cancelada" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao cancelar comissão", description: error.message, variant: "destructive" });
    },
  });
}

export function useCommissionsByBroker() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['commissions-by-broker', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];

      const { data, error } = await supabase
        .from('commissions')
        .select('user_id, amount, calculated_value, status')
        .eq('organization_id', profile.organization_id);

      if (error) throw error;

      const commissionsTyped = data as unknown as { user_id: string; amount: number; calculated_value: number; status: string }[];

      // Get unique user IDs
      const userIds = [...new Set(commissionsTyped.map(c => c.user_id))];
      if (userIds.length === 0) return [];

      // Fetch user details
      const { data: users } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', userIds);

      const usersMap = new Map((users || []).map(u => [u.id, u]));

      // Group by user
      const grouped = commissionsTyped.reduce((acc: Record<string, { user: { id: string; name: string; email: string }; forecast: number; approved: number; paid: number; total: number }>, item) => {
        const userId = item.user_id;
        if (!acc[userId]) {
          const user = usersMap.get(userId);
          acc[userId] = {
            user: user || { id: userId, name: 'Usuário', email: '' },
            forecast: 0,
            approved: 0,
            paid: 0,
            total: 0,
          };
        }
        
        // Use amount as primary, fallback to calculated_value
        const value = Number(item.amount ?? item.calculated_value ?? 0);
        acc[userId].total += value;
        
        if (item.status === 'forecast') acc[userId].forecast += value;
        if (item.status === 'approved') acc[userId].approved += value;
        if (item.status === 'paid') acc[userId].paid += value;

        return acc;
      }, {});

      return Object.values(grouped);
    },
    enabled: !!profile?.organization_id,
  });
}
