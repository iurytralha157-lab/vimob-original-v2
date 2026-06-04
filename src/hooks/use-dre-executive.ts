import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

export interface DRELine {
  id: string;
  name: string;
  value: number;
  previousValue?: number;
  percentage?: number;
  variation?: number;
  isTotal?: boolean;
  type?: 'revenue' | 'expense' | 'total' | 'tax';
  level?: number;
}

export interface DREData {
  period: { start: string; end: string };
  previousPeriod?: { start: string; end: string };
  lines: DRELine[];
  totals: {
    grossRevenue: number;
    netRevenue: number;
    grossProfit: number;
    operatingResult: number;
    netResult: number;
    ebitda: number;
    roi: number;
    fixedCosts: number;
    variableCosts: number;
  };
}

interface UseDREParams {
  startDate: Date;
  endDate: Date;
  regime: 'cash' | 'accrual';
  compareWithPrevious?: boolean;
  projectId?: string;
}

export function useDREExecutive({ startDate, endDate, regime, compareWithPrevious = false, projectId }: UseDREParams) {
  const { organization } = useAuth();

  return useQuery({
    queryKey: ['dre-executive', organization?.id, startDate.toISOString(), endDate.toISOString(), regime, compareWithPrevious, projectId],
    queryFn: async (): Promise<DREData> => {
      if (!organization?.id) throw new Error('No organization');

      const statusFilter = regime === 'cash' ? ['paid'] : ['pending', 'paid', 'overdue'];

      const fetchEntries = async (s: Date, e: Date) => {
        let q: any = supabase.from('financial_entries');
        
        q = q.select('amount, type, status, category, category_group, due_date, paid_date, project_id')
             .eq('organization_id', organization.id)
             .in('status', statusFilter);

        if (projectId) q = q.eq('project_id', projectId);

        const dateField = regime === 'cash' ? 'paid_date' : 'due_date';
        q = q.gte(dateField, format(s, 'yyyy-MM-dd')).lte(dateField, format(e, 'yyyy-MM-dd'));

        const { data, error } = await q;
        if (error) throw error;
        return (data || []) as any[];
      };

      const entries = await fetchEntries(startDate, endDate);

      let previousEntries: any[] = [];
      if (compareWithPrevious) {
        const interval = endDate.getTime() - startDate.getTime();
        const prevStart = new Date(startDate.getTime() - interval);
        const prevEnd = new Date(endDate.getTime() - interval);
        previousEntries = await fetchEntries(prevStart, prevEnd);
      }

      const categorize = (data: any[]) => {
        const categories: Record<string, number> = {};
        data.forEach(e => {
          const cat = e.category || 'Outros';
          categories[cat] = (categories[cat] || 0) + (Number(e.amount) || 0);
        });

        const grossRevenue = data.filter(e => e.type === 'receivable' || e.category_group === 'gross_revenue').reduce((s, e) => s + (Number(e.amount) || 0), 0);
        
        const taxes = data.filter(e => e.category_group === 'tax_deduction').reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const variableCosts = data.filter(e => e.category_group === 'variable_cost').reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const fixedCosts = data.filter(e => e.category_group === 'fixed_cost' || (e.type === 'payable' && !e.category_group)).reduce((s, e) => s + (Number(e.amount) || 0), 0);


        return { grossRevenue, taxes, variableCosts, fixedCosts };
      };

      const current = categorize(entries);
      const prev = categorize(previousEntries);

      const netRevenue = current.grossRevenue - current.taxes;
      const grossProfit = netRevenue - current.variableCosts;
      const ebitda = grossProfit - current.fixedCosts;
      const netResult = ebitda; // Simplified for now (could include interest/depreciation)
      const roi = (current.variableCosts + current.fixedCosts) > 0 ? (ebitda / (current.variableCosts + current.fixedCosts)) : 0;

      const pNetRevenue = prev.grossRevenue - prev.taxes;
      const pGrossProfit = pNetRevenue - prev.variableCosts;
      const pEbitda = pGrossProfit - prev.fixedCosts;

      const lines: DRELine[] = [
        { id: 'gross_rev', name: '(+) Receita Bruta', value: current.grossRevenue, previousValue: prev.grossRevenue, isTotal: false, type: 'revenue', level: 0 },
        { id: 'taxes', name: '(-) Deduções e Impostos', value: current.taxes, previousValue: prev.taxes, isTotal: false, type: 'tax', level: 1 },
        { id: 'net_rev', name: '(=) Receita Líquida', value: netRevenue, previousValue: pNetRevenue, isTotal: true, type: 'total', level: 0 },
        { id: 'var_costs', name: '(-) Custos Variáveis (Obra)', value: current.variableCosts, previousValue: prev.variableCosts, isTotal: false, type: 'expense', level: 1 },
        { id: 'gross_profit', name: '(=) Lucro Bruto', value: grossProfit, previousValue: pGrossProfit, isTotal: true, type: 'total', level: 0 },
        { id: 'fixed_costs', name: '(-) Custos Fixos (Adm)', value: current.fixedCosts, previousValue: prev.fixedCosts, isTotal: false, type: 'expense', level: 1 },
        { id: 'ebitda', name: '(=) EBITDA', value: ebitda, previousValue: pEbitda, isTotal: true, type: 'total', level: 0 },
        { id: 'net_result', name: '(=) Lucro Líquido', value: netResult, previousValue: pEbitda, isTotal: true, type: 'total', level: 0 }
      ];

      return {
        period: { start: format(startDate, 'yyyy-MM-dd'), end: format(endDate, 'yyyy-MM-dd') },
        lines,
        totals: {
          grossRevenue: current.grossRevenue,
          netRevenue,
          grossProfit,
          operatingResult: ebitda,
          netResult,
          ebitda,
          roi,
          fixedCosts: current.fixedCosts,
          variableCosts: current.variableCosts
        }
      };
    },
    enabled: !!organization?.id
  });
}
