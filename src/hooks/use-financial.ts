import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { logAuditAction } from "./use-audit-logs";
export interface FinancialCategory {
  id: string;
  organization_id: string;
  name: string;
  type: 'income' | 'expense';
  created_at: string;
  category_group?: string;
}

export interface FinancialEntry {
  id: string;
  organization_id: string;
  type: 'payable' | 'receivable';
  category?: string;
  category_group?: string;
  contract_id?: string;
  lead_id?: string;
  broker_id?: string;
  description?: string;
  amount: number;
  due_date?: string;
  paid_date?: string;
  payment_method?: string;
  status?: string;
  notes?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  contract?: { contract_number?: string };
  // Installments
  installment_number?: number;
  total_installments?: number;
  // Recurring
  is_recurring?: boolean;
  recurring_type?: 'monthly' | 'weekly' | 'yearly';
  parent_entry_id?: string;
}

export function useFinancialCategories() {
  const { profile, organization } = useAuth();
  const organizationId = organization?.id || profile?.organization_id;

  return useQuery({
    queryKey: ['financial-categories', organizationId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('financial_categories')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data as FinancialCategory[];
    },
    enabled: !!organizationId,
  });
}

export function useCreateFinancialCategory() {
  const queryClient = useQueryClient();
  const { profile, organization } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { name: string; type: 'income' | 'expense' }) => {
      const orgId = organization?.id || profile?.organization_id;
      const { data: result, error } = await (supabase as any)
        .from('financial_categories')
        .insert({
          name: data.name,
          type: data.type,
          organization_id: orgId,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-categories'] });
      toast({ title: "Categoria criada com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar categoria", description: error.message, variant: "destructive" });
    },
  });
}

export function useFinancialEntries(filters?: { type?: string; status?: string; startDate?: string; endDate?: string }) {
  const { profile, organization } = useAuth();
  const organizationId = organization?.id || profile?.organization_id;

  return useQuery({
    queryKey: ['financial-entries', organizationId, filters],
    queryFn: async () => {
      let query = supabase
        .from('financial_entries')
        .select(`
          *,
          contract:contracts(contract_number)
        `)
        .eq('organization_id', organizationId)
        .order('due_date', { ascending: true });

      if (filters?.type) {
        query = query.eq('type', filters.type);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.startDate) {
        query = query.gte('due_date', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('due_date', filters.endDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as FinancialEntry[];
    },
    enabled: !!organizationId,
  });
}

export function useCreateFinancialEntry() {
  const queryClient = useQueryClient();
  const { profile, user, organization } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: Partial<FinancialEntry>) => {
      const orgId = organization?.id || profile?.organization_id;
      
      const { data: result, error } = await supabase
        .from('financial_entries')
        .insert({
          type: data.type,
          category: data.category,
          category_group: data.category_group,
          description: data.description,
          amount: data.amount,
          due_date: data.due_date,
          payment_method: data.payment_method,
          contract_id: data.contract_id || null,
          notes: data.notes,
          status: data.status || 'pending',
          organization_id: orgId,
          created_by: user?.id,
        } as never)
        .select()
        .single();

      if (error) throw error;

      // Audit log: financial entry created
      logAuditAction(
        'create',
        'financial_entry',
        (result as any).id,
        undefined,
        { type: data.type, category: data.category, amount: data.amount, description: data.description },
        orgId || undefined
      ).catch(console.error);

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-entries'] });
      queryClient.invalidateQueries({ queryKey: ['financial-dashboard'] });
      toast({ title: "Lançamento criado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar lançamento", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateFinancialEntry() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<FinancialEntry> & { id: string }) => {
      // Fetch old data for audit
      const { data: oldEntry } = await supabase
        .from('financial_entries')
        .select('type, category, amount, status, organization_id')
        .eq('id', id)
        .single();

      const { data: result, error } = await supabase
        .from('financial_entries')
        .update(data as never)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Audit log: financial entry updated
      logAuditAction(
        'update',
        'financial_entry',
        id,
        oldEntry as Record<string, unknown> || undefined,
        data as Record<string, unknown>,
        (oldEntry as any)?.organization_id
      ).catch(console.error);

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-entries'] });
      queryClient.invalidateQueries({ queryKey: ['financial-dashboard'] });
      toast({ title: "Lançamento atualizado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar lançamento", description: error.message, variant: "destructive" });
    },
  });
}

export function useMarkEntryAsPaid() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, paid_value }: { id: string; paid_value?: number }) => {
      const { data: result, error } = await supabase
        .from('financial_entries')
        .update({
          status: 'paid',
          paid_date: new Date().toISOString().split('T')[0], // Corrigido: usa paid_date (date) ao invés de paid_at
          paid_value,
          paid_amount: paid_value,
        } as never)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-entries'] });
      queryClient.invalidateQueries({ queryKey: ['financial-dashboard'] });
      toast({ title: "Pagamento registrado com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao registrar pagamento", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteFinancialEntry() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      // Fetch entry data for audit before deletion
      const { data: entryData } = await supabase
        .from('financial_entries')
        .select('type, category, amount, description, organization_id')
        .eq('id', id)
        .single();

      const { error } = await supabase
        .from('financial_entries')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Audit log: financial entry deleted
      if (entryData) {
        logAuditAction(
          'delete',
          'financial_entry',
          id,
          entryData as Record<string, unknown>,
          undefined,
          (entryData as any).organization_id
        ).catch(console.error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-entries'] });
      queryClient.invalidateQueries({ queryKey: ['financial-dashboard'] });
      toast({ title: "Lançamento excluído com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir lançamento", description: error.message, variant: "destructive" });
    },
  });
}

export function useFinancialDashboard() {
  const { profile, organization } = useAuth();
  const organizationId = organization?.id || profile?.organization_id;

  return useQuery({
    queryKey: ['financial-dashboard', organizationId],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const days30 = new Date(today); days30.setDate(days30.getDate() + 30);
      const days60 = new Date(today); days60.setDate(days60.getDate() + 60);
      const days90 = new Date(today); days90.setDate(days90.getDate() + 90);
      const last30 = new Date(today); last30.setDate(last30.getDate() - 30);
      const yearStart = new Date(today.getFullYear(), 0, 1);
      const historyStart = new Date(Math.min(
        new Date(today.getFullYear(), today.getMonth() - 5, 1).getTime(),
        yearStart.getTime()
      ));

      const [
        { data: receivablesData },
        { data: payables },
        { data: paidEntries },
        { data: commissions },
        { data: wonLeadsData },
        { data: contractsData },
      ] = await Promise.all([
        supabase.from('financial_entries').select('amount, due_date').eq('organization_id', organizationId).eq('type', 'receivable').eq('status', 'pending'),
        supabase.from('financial_entries').select('amount, due_date').eq('organization_id', organizationId).eq('type', 'payable').eq('status', 'pending'),
        supabase.from('financial_entries').select('amount, type, paid_date').eq('organization_id', organizationId).eq('status', 'paid').gte('paid_date', historyStart.toISOString().split('T')[0]),
        supabase.from('commissions').select('amount, status').eq('organization_id', organizationId),
        supabase.from('leads').select('id, valor_interesse, won_at').eq('organization_id', organizationId).eq('deal_status', 'won').gt('valor_interesse', 0),
        supabase.from('contracts').select('id, value, commission_value, status, signing_date').eq('organization_id', organizationId).in('status', ['active', 'signed', 'completed']),
      ]);

      const receivables = (receivablesData as any[]) || [];
      const payablesTyped = (payables as any[]) || [];
      const commissionsTyped = (commissions as any[]) || [];
      const paidEntriesTyped = (paidEntries as any[]) || [];
      const wonLeads = (wonLeadsData as any[]) || [];
      const contracts = (contractsData as any[]) || [];

      const inRange = (d: string, a: Date, b: Date) => { const x = new Date(d); return x >= a && x <= b; };
      const sum = (arr: any[], k = 'amount') => arr.reduce((s, r) => s + Number(r[k] || 0), 0);

      const receivable30 = sum(receivables.filter(r => inRange(r.due_date, today, days30)));
      const receivable60 = sum(receivables.filter(r => { const x = new Date(r.due_date); return x > days30 && x <= days60; }));
      const receivable90 = sum(receivables.filter(r => { const x = new Date(r.due_date); return x > days60 && x <= days90; }));

      // Receita Confirmada (últimos 30d) — entradas com paid_date no período
      const confirmedRevenue30 = paidEntriesTyped
        .filter(e => e.type === 'receivable' && new Date(e.paid_date) >= last30 && new Date(e.paid_date) <= today)
        .reduce((s, e) => s + Number(e.amount || 0), 0);

      // Receita Confirmada YTD
      const confirmedRevenueYTD = paidEntriesTyped
        .filter(e => e.type === 'receivable' && new Date(e.paid_date) >= yearStart)
        .reduce((s, e) => s + Number(e.amount || 0), 0);

      const totalPayable = sum(payablesTyped);

      const forecastCommissions = sum(commissionsTyped.filter(c => c.status === 'forecast' || c.status === 'prevista'));
      const pendingCommissions = sum(commissionsTyped.filter(c => c.status === 'pending' || c.status === 'pendente' || c.status === 'approved' || c.status === 'aprovada'));
      const paidCommissions = sum(commissionsTyped.filter(c => c.status === 'paid' || c.status === 'paga'));

      const overdueReceivables = sum(receivables.filter(r => new Date(r.due_date) < today));
      const overduePayables = sum(payablesTyped.filter(p => new Date(p.due_date) < today));

      // VGV Bruto = soma valor contratos ativos. VGV Líquido = bruto - comissões
      const vgvBruto = contracts.reduce((s, c) => s + Number(c.value || 0), 0);
      const vgvCommissions = contracts.reduce((s, c) => s + Number(c.commission_value || 0), 0);
      const vgvLiquido = vgvBruto - vgvCommissions;
      const leadsValue = wonLeads.reduce((s, l) => s + Number(l.valor_interesse || 0), 0);

      // Monthly cash flow
      const monthlyData: { month: string; receitas: number; despesas: number }[] = [];
      const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      for (let i = 5; i >= 0; i--) {
        const date = new Date(today); date.setMonth(date.getMonth() - i);
        const y = date.getFullYear(), m = date.getMonth();
        const r = paidEntriesTyped.filter(e => e.type === 'receivable' && new Date(e.paid_date).getMonth() === m && new Date(e.paid_date).getFullYear() === y).reduce((s, e) => s + Number(e.amount || 0), 0);
        const d = paidEntriesTyped.filter(e => e.type === 'payable' && new Date(e.paid_date).getMonth() === m && new Date(e.paid_date).getFullYear() === y).reduce((s, e) => s + Number(e.amount || 0), 0);
        monthlyData.push({ month: `${monthNames[m]}/${String(y).slice(2)}`, receitas: r, despesas: d });
      }

      // Projeção anual: receita confirmada YTD extrapolada + previstas 90d
      const monthsElapsed = Math.max(1, today.getMonth() + 1);
      const annualProjection = (confirmedRevenueYTD / monthsElapsed) * 12;

      return {
        receivable30,
        receivable60,
        receivable90,
        confirmedRevenue30,
        confirmedRevenueYTD,
        totalPayable,
        forecastCommissions,
        paidCommissions,
        pendingCommissions,
        overdueReceivables,
        overduePayables,
        monthlyData,
        totalLeadsValue: leadsValue,
        vgvBruto,
        vgvLiquido,
        totalContractsValue: vgvLiquido,
        activeContracts: contracts.length,
        wonLeadsCount: wonLeads.length,
        avgTicket: contracts.length > 0 ? vgvBruto / contracts.length : 0,
        conversionRate: wonLeads.length > 0 ? (contracts.length / wonLeads.length) * 100 : 0,
        annualProjection,
        defaultRate: receivable30 > 0 ? (overdueReceivables / (receivable30 + overdueReceivables)) * 100 : 0,
      };
    },
    enabled: !!organizationId,
  });
}
