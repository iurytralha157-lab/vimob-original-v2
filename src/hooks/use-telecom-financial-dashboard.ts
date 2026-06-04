import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, addDays, addMonths, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface TelecomFinancialDashboard {
  // Receita recorrente baseada em clientes instalados
  mrr: number; // Monthly Recurring Revenue (clientes INSTALADOS)
  receivable30: number; // MRR * 1 (próximos 30 dias)
  receivable60: number; // MRR * 2 (próximos 60 dias)
  receivable90: number; // MRR * 3 (próximos 90 dias)
  
  // Financial entries
  totalPayable: number;
  overdueReceivables: number;
  overduePayables: number;
  
  // Commissions
  pendingCommissions: number;
  forecastCommissions: number;
  paidCommissions: number;
  
  // Customer breakdown by status
  activeCustomers: number;      // INSTALADOS
  newCustomers: number;         // NOVO
  pendingCustomers: number;     // AGUARDANDO + EM_ANALISE
  canceledCustomers: number;    // CANCELADO
  suspendedCustomers: number;   // SUSPENSO
  defaultingCustomers: number;  // INADIMPLENTE
  
  // Values at risk
  churnValue: number;           // Valor de clientes cancelados
  defaultingValue: number;      // Valor de clientes inadimplentes
  
  // Monthly data for charts
  monthlyData: {
    month: string;
    receitas: number;
    despesas: number;
    mrr: number;
  }[];
  
  // Annual projection
  annualProjection: number;
}

export function useTelecomFinancialDashboard() {
  const { organization, profile, isSuperAdmin } = useAuth();
  const isAdmin = profile?.role === 'admin' || isSuperAdmin;

  return useQuery({
    queryKey: ['telecom-financial-dashboard', organization?.id, isAdmin, profile?.id],
    queryFn: async (): Promise<TelecomFinancialDashboard> => {
      if (!organization?.id) {
        return getEmptyDashboard();
      }

      const today = new Date();
      const sixMonthsAgo = subMonths(today, 6);

      // Build base query conditions for telecom customers
      const buildCustomerQuery = (baseQuery: any) => {
        let q = baseQuery.eq('organization_id', organization.id);
        if (!isAdmin && profile?.id) {
          q = q.eq('seller_id', profile.id);
        }
        return q;
      };

      // Fetch all data in parallel
      const [
        customersResult,
        payablesResult,
        receivablesResult,
        paidEntriesResult,
        commissionsResult,
      ] = await Promise.all([
        // All telecom customers with status and plan_value
        buildCustomerQuery(
          supabase.from('telecom_customers').select('status, plan_value')
        ),
        
        // Pending payables
        supabase
          .from('financial_entries')
          .select('amount, due_date')
          .eq('type', 'payable')
          .eq('status', 'pending'),
        
        // Pending receivables from financial_entries (manual entries)
        supabase
          .from('financial_entries')
          .select('amount, due_date')
          .eq('type', 'receivable')
          .eq('status', 'pending'),
        
        // Paid entries for cash flow chart
        supabase
          .from('financial_entries')
          .select('amount, type, paid_date')
          .eq('status', 'paid')
          .gte('paid_date', sixMonthsAgo.toISOString().split('T')[0]),
        
        // Commissions
        supabase
          .from('commissions')
          .select('amount, status'),
      ]);

      const customers = (customersResult.data || []) as { status: string; plan_value: number | null }[];
      const payables = (payablesResult.data || []) as { amount: number; due_date: string }[];
      const receivables = (receivablesResult.data || []) as { amount: number; due_date: string }[];
      const paidEntries = (paidEntriesResult.data || []) as { amount: number; type: string; paid_date: string }[];
      const commissions = (commissionsResult.data || []) as { amount: number; status: string }[];

      // Calculate customer counts by status
      const activeCustomers = customers.filter(c => c.status === 'INSTALADOS');
      const newCustomers = customers.filter(c => c.status === 'NOVO');
      const aguardando = customers.filter(c => c.status === 'AGUARDANDO');
      const emAnalise = customers.filter(c => c.status === 'EM_ANALISE');
      const canceledCustomers = customers.filter(c => c.status === 'CANCELADO');
      const suspendedCustomers = customers.filter(c => c.status === 'SUSPENSO');
      const defaultingCustomers = customers.filter(c => c.status === 'INADIMPLENTE');

      // Calculate MRR from active customers
      const mrr = activeCustomers.reduce((sum, c) => sum + (c.plan_value || 0), 0);

      // A Receber baseado em MRR (projeção de receita recorrente)
      const receivable30 = mrr; // Next 30 days = 1x MRR
      const receivable60 = mrr * 2; // Next 60 days = 2x MRR
      const receivable90 = mrr * 3; // Next 90 days = 3x MRR

      // Total payable from financial entries
      const totalPayable = payables.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      // Overdue calculations
      const overdueReceivables = receivables
        .filter(r => new Date(r.due_date) < today)
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);

      const overduePayables = payables
        .filter(p => new Date(p.due_date) < today)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

      // Commissions
      const forecastCommissions = commissions
        .filter(c => c.status === 'forecast' || c.status === 'pending')
        .reduce((sum, c) => sum + Number(c.amount || 0), 0);

      const paidCommissions = commissions
        .filter(c => c.status === 'paid')
        .reduce((sum, c) => sum + Number(c.amount || 0), 0);

      const pendingCommissions = commissions
        .filter(c => c.status === 'pending')
        .reduce((sum, c) => sum + Number(c.amount || 0), 0);

      // Values at risk
      const churnValue = canceledCustomers.reduce((sum, c) => sum + (c.plan_value || 0), 0);
      const defaultingValue = defaultingCustomers.reduce((sum, c) => sum + (c.plan_value || 0), 0);

      // Build monthly cash flow data for the last 6 months
      const monthlyData: TelecomFinancialDashboard['monthlyData'] = [];
      const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

      for (let i = 5; i >= 0; i--) {
        const date = subMonths(today, i);
        const year = date.getFullYear();
        const month = date.getMonth();

        const monthReceitas = paidEntries
          .filter(e => {
            const paidDate = new Date(e.paid_date);
            return e.type === 'receivable' && paidDate.getMonth() === month && paidDate.getFullYear() === year;
          })
          .reduce((sum, e) => sum + Number(e.amount || 0), 0);

        const monthDespesas = paidEntries
          .filter(e => {
            const paidDate = new Date(e.paid_date);
            return e.type === 'payable' && paidDate.getMonth() === month && paidDate.getFullYear() === year;
          })
          .reduce((sum, e) => sum + Number(e.amount || 0), 0);

        monthlyData.push({
          month: `${monthNames[month]}/${String(year).slice(2)}`,
          receitas: monthReceitas + mrr, // Include projected MRR in revenue
          despesas: monthDespesas,
          mrr: mrr,
        });
      }

      // Annual projection
      const annualProjection = mrr * 12;

      return {
        mrr,
        receivable30,
        receivable60,
        receivable90,
        totalPayable,
        overdueReceivables,
        overduePayables,
        pendingCommissions,
        forecastCommissions,
        paidCommissions,
        activeCustomers: activeCustomers.length,
        newCustomers: newCustomers.length,
        pendingCustomers: aguardando.length + emAnalise.length,
        canceledCustomers: canceledCustomers.length,
        suspendedCustomers: suspendedCustomers.length,
        defaultingCustomers: defaultingCustomers.length,
        churnValue,
        defaultingValue,
        monthlyData,
        annualProjection,
      };
    },
    enabled: !!organization?.id,
  });
}

function getEmptyDashboard(): TelecomFinancialDashboard {
  return {
    mrr: 0,
    receivable30: 0,
    receivable60: 0,
    receivable90: 0,
    totalPayable: 0,
    overdueReceivables: 0,
    overduePayables: 0,
    pendingCommissions: 0,
    forecastCommissions: 0,
    paidCommissions: 0,
    activeCustomers: 0,
    newCustomers: 0,
    pendingCustomers: 0,
    canceledCustomers: 0,
    suspendedCustomers: 0,
    defaultingCustomers: 0,
    churnValue: 0,
    defaultingValue: 0,
    monthlyData: [],
    annualProjection: 0,
  };
}
