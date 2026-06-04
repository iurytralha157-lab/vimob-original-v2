import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { subMonths, format } from 'date-fns';

// Tipos manuais para as tabelas DRE (ainda não estão no types.ts gerado)
interface DREAccountGroup {
  id: string;
  organization_id: string;
  name: string;
  group_type: string;
  display_order: number;
  parent_id: string | null;
  is_system: boolean;
  created_at: string;
}

interface DREAccountMapping {
  id: string;
  organization_id: string;
  group_id: string;
  category: string;
  entry_type: string;
  created_at: string;
  group?: DREAccountGroup;
}

export interface DRELine {
  id: string;
  name: string;
  value: number;
  previousValue?: number;
  percentage?: number;
  variation?: number;
  children?: DRELine[];
  isTotal?: boolean;
  type?: string;
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
  };
}

interface UseDREParams {
  startDate: Date;
  endDate: Date;
  regime: 'cash' | 'accrual';
  compareWithPrevious?: boolean;
}

export function useDRE({ startDate, endDate, regime, compareWithPrevious = false }: UseDREParams) {
  const { profile } = useAuth();
  const organizationId = profile?.organization_id;

  return useQuery({
    queryKey: ['dre', organizationId, startDate.toISOString(), endDate.toISOString(), regime, compareWithPrevious],
    queryFn: async (): Promise<DREData> => {
      if (!organizationId) throw new Error('No organization');

      const statusFilter = regime === 'cash' ? ['paid'] : ['pending', 'paid', 'overdue'];

      // Buscar grupos DRE da organização usando query raw
      const { data: groupsRaw, error: groupsError } = await supabase
        .from('dre_account_groups' as any)
        .select('*')
        .eq('organization_id', organizationId)
        .order('display_order', { ascending: true });

      if (groupsError) throw groupsError;
      const groups = (groupsRaw || []) as unknown as DREAccountGroup[];

      // Buscar mapeamentos
      const { data: mappingsRaw, error: mappingsError } = await supabase
        .from('dre_account_mappings' as any)
        .select('*')
        .eq('organization_id', organizationId);

      if (mappingsError) throw mappingsError;
      const mappings = (mappingsRaw || []) as unknown as DREAccountMapping[];

      // Buscar lançamentos do período
      let query = supabase
        .from('financial_entries')
        .select('id, amount, category, type, status, due_date, paid_date')
        .eq('organization_id', organizationId)
        .in('status', statusFilter);

      if (regime === 'cash') {
        query = query
          .gte('paid_date', format(startDate, 'yyyy-MM-dd'))
          .lte('paid_date', format(endDate, 'yyyy-MM-dd'));
      } else {
        query = query
          .gte('due_date', format(startDate, 'yyyy-MM-dd'))
          .lte('due_date', format(endDate, 'yyyy-MM-dd'));
      }

      const { data: entries, error: entriesError } = await query;
      if (entriesError) throw entriesError;

      // Buscar período anterior se comparativo ativado
      let previousEntries: typeof entries = [];
      const monthsDiff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
      const prevStart = subMonths(startDate, monthsDiff || 1);
      const prevEnd = subMonths(endDate, monthsDiff || 1);

      if (compareWithPrevious) {
        let prevQuery = supabase
          .from('financial_entries')
          .select('id, amount, category, type, status, due_date, paid_date')
          .eq('organization_id', organizationId)
          .in('status', statusFilter);

        if (regime === 'cash') {
          prevQuery = prevQuery
            .gte('paid_date', format(prevStart, 'yyyy-MM-dd'))
            .lte('paid_date', format(prevEnd, 'yyyy-MM-dd'));
        } else {
          prevQuery = prevQuery
            .gte('due_date', format(prevStart, 'yyyy-MM-dd'))
            .lte('due_date', format(prevEnd, 'yyyy-MM-dd'));
        }

        const { data: prevData } = await prevQuery;
        previousEntries = prevData || [];
      }

      // Calcular valores por grupo
      const groupValues: Record<string, number> = {};
      const prevGroupValues: Record<string, number> = {};

      // Inicializar grupos
      groups.forEach(g => {
        groupValues[g.id] = 0;
        prevGroupValues[g.id] = 0;
      });

      // Mapear entradas para grupos
      entries?.forEach(entry => {
        const mapping = mappings.find(m => 
          m.category === entry.category && m.entry_type === entry.type
        );
        if (mapping && groupValues[mapping.group_id] !== undefined) {
          groupValues[mapping.group_id] += entry.amount || 0;
        }
      });

      previousEntries?.forEach(entry => {
        const mapping = mappings.find(m => 
          m.category === entry.category && m.entry_type === entry.type
        );
        if (mapping && prevGroupValues[mapping.group_id] !== undefined) {
          prevGroupValues[mapping.group_id] += entry.amount || 0;
        }
      });

      // Calcular totais por tipo de grupo
      const calculateByType = (type: string, values: Record<string, number>) => {
        return groups
          .filter(g => g.group_type === type && !g.parent_id)
          .reduce((sum, g) => sum + (values[g.id] || 0), 0);
      };

      const grossRevenue = calculateByType('revenue', groupValues);
      const deductions = calculateByType('deduction', groupValues);
      const netRevenue = grossRevenue - deductions;
      const costs = calculateByType('cost', groupValues);
      const grossProfit = netRevenue - costs;
      const expenses = calculateByType('expense', groupValues);
      const operatingResult = grossProfit - expenses;
      const financialExpenses = groups
        .filter(g => g.group_type === 'financial_expense')
        .reduce((sum, g) => sum + (groupValues[g.id] || 0), 0);
      const financialRevenues = groups
        .filter(g => g.group_type === 'financial_revenue')
        .reduce((sum, g) => sum + (groupValues[g.id] || 0), 0);
      const taxes = groups
        .filter(g => g.group_type === 'tax')
        .reduce((sum, g) => sum + (groupValues[g.id] || 0), 0);
      const netResult = operatingResult - financialExpenses + financialRevenues - taxes;

      // Montar linhas hierárquicas
      const buildLines = (): DRELine[] => {
        const lines: DRELine[] = [];

        const createLine = (
          id: string, 
          name: string, 
          value: number, 
          prevValue: number,
          isTotal: boolean = false,
          type?: string,
          level: number = 0
        ): DRELine => {
          const percentage = grossRevenue > 0 ? (value / grossRevenue) * 100 : 0;
          const variation = prevValue !== 0 ? ((value - prevValue) / Math.abs(prevValue)) * 100 : (value > 0 ? 100 : 0);
          
          return {
            id,
            name,
            value,
            previousValue: compareWithPrevious ? prevValue : undefined,
            percentage,
            variation: compareWithPrevious ? variation : undefined,
            isTotal,
            type,
            level
          };
        };

        // (+) RECEITA OPERACIONAL BRUTA
        const revenueGroups = groups.filter(g => g.group_type === 'revenue' && !g.parent_id);
        lines.push(createLine('header_revenue', '(+) RECEITA OPERACIONAL BRUTA', grossRevenue, calculateByType('revenue', prevGroupValues), true, 'revenue', 0));
        revenueGroups.forEach(g => {
          lines.push(createLine(g.id, g.name, groupValues[g.id] || 0, prevGroupValues[g.id] || 0, false, 'revenue', 1));
        });

        // (-) DEDUÇÕES DA RECEITA
        const deductionGroups = groups.filter(g => g.group_type === 'deduction' && !g.parent_id);
        const prevDeductions = calculateByType('deduction', prevGroupValues);
        lines.push(createLine('header_deduction', '(-) DEDUÇÕES DA RECEITA', deductions, prevDeductions, true, 'deduction', 0));
        deductionGroups.forEach(g => {
          lines.push(createLine(g.id, g.name, groupValues[g.id] || 0, prevGroupValues[g.id] || 0, false, 'deduction', 1));
        });

        // (=) RECEITA LÍQUIDA
        const prevNetRevenue = calculateByType('revenue', prevGroupValues) - prevDeductions;
        lines.push(createLine('total_net_revenue', '(=) RECEITA LÍQUIDA', netRevenue, prevNetRevenue, true, 'total', 0));

        // (-) CUSTOS OPERACIONAIS
        const costGroups = groups.filter(g => g.group_type === 'cost' && !g.parent_id);
        const prevCosts = calculateByType('cost', prevGroupValues);
        lines.push(createLine('header_costs', '(-) CUSTOS OPERACIONAIS', costs, prevCosts, true, 'cost', 0));
        costGroups.forEach(g => {
          lines.push(createLine(g.id, g.name, groupValues[g.id] || 0, prevGroupValues[g.id] || 0, false, 'cost', 1));
        });

        // (=) LUCRO BRUTO
        const prevGrossProfit = prevNetRevenue - prevCosts;
        lines.push(createLine('total_gross_profit', '(=) LUCRO BRUTO', grossProfit, prevGrossProfit, true, 'total', 0));

        // (-) DESPESAS OPERACIONAIS
        const expenseGroups = groups.filter(g => g.group_type === 'expense' && !g.parent_id);
        const prevExpenses = calculateByType('expense', prevGroupValues);
        lines.push(createLine('header_expenses', '(-) DESPESAS OPERACIONAIS', expenses, prevExpenses, true, 'expense', 0));
        expenseGroups.forEach(g => {
          lines.push(createLine(g.id, g.name, groupValues[g.id] || 0, prevGroupValues[g.id] || 0, false, 'expense', 1));
        });

        // (=) RESULTADO OPERACIONAL (EBITDA)
        const prevOperatingResult = prevGrossProfit - prevExpenses;
        lines.push(createLine('total_ebitda', '(=) RESULTADO OPERACIONAL (EBITDA)', operatingResult, prevOperatingResult, true, 'total', 0));

        // (-) DESPESAS FINANCEIRAS
        const finExpGroups = groups.filter(g => g.group_type === 'financial_expense');
        const prevFinExp = finExpGroups.reduce((sum, g) => sum + (prevGroupValues[g.id] || 0), 0);
        lines.push(createLine('header_fin_exp', '(-) DESPESAS FINANCEIRAS', financialExpenses, prevFinExp, true, 'financial_expense', 0));
        finExpGroups.forEach(g => {
          lines.push(createLine(g.id, g.name, groupValues[g.id] || 0, prevGroupValues[g.id] || 0, false, 'financial_expense', 1));
        });

        // (+) RECEITAS FINANCEIRAS
        const finRevGroups = groups.filter(g => g.group_type === 'financial_revenue');
        const prevFinRev = finRevGroups.reduce((sum, g) => sum + (prevGroupValues[g.id] || 0), 0);
        lines.push(createLine('header_fin_rev', '(+) RECEITAS FINANCEIRAS', financialRevenues, prevFinRev, true, 'financial_revenue', 0));
        finRevGroups.forEach(g => {
          lines.push(createLine(g.id, g.name, groupValues[g.id] || 0, prevGroupValues[g.id] || 0, false, 'financial_revenue', 1));
        });

        // (=) RESULTADO ANTES IR/CS
        const resultBeforeTaxes = operatingResult - financialExpenses + financialRevenues;
        const prevResultBeforeTaxes = prevOperatingResult - prevFinExp + prevFinRev;
        lines.push(createLine('total_before_taxes', '(=) RESULTADO ANTES IR/CS', resultBeforeTaxes, prevResultBeforeTaxes, true, 'total', 0));

        // (-) IMPOSTOS SOBRE LUCRO
        const taxGroups = groups.filter(g => g.group_type === 'tax');
        const prevTaxes = taxGroups.reduce((sum, g) => sum + (prevGroupValues[g.id] || 0), 0);
        lines.push(createLine('header_taxes', '(-) IMPOSTOS SOBRE LUCRO', taxes, prevTaxes, true, 'tax', 0));
        taxGroups.forEach(g => {
          lines.push(createLine(g.id, g.name, groupValues[g.id] || 0, prevGroupValues[g.id] || 0, false, 'tax', 1));
        });

        // (=) LUCRO/PREJUÍZO LÍQUIDO
        const prevNetResult = prevResultBeforeTaxes - prevTaxes;
        lines.push(createLine('total_net_result', netResult >= 0 ? '(=) LUCRO LÍQUIDO' : '(=) PREJUÍZO LÍQUIDO', netResult, prevNetResult, true, 'result', 0));

        return lines;
      };

      return {
        period: { 
          start: format(startDate, 'yyyy-MM-dd'), 
          end: format(endDate, 'yyyy-MM-dd') 
        },
        previousPeriod: compareWithPrevious ? {
          start: format(prevStart, 'yyyy-MM-dd'),
          end: format(prevEnd, 'yyyy-MM-dd')
        } : undefined,
        lines: buildLines(),
        totals: {
          grossRevenue,
          netRevenue,
          grossProfit,
          operatingResult,
          netResult
        }
      };
    },
    enabled: !!organizationId
  });
}

export function useDREGroups() {
  const { profile } = useAuth();
  const organizationId = profile?.organization_id;

  return useQuery({
    queryKey: ['dre-groups', organizationId],
    queryFn: async () => {
      if (!organizationId) throw new Error('No organization');

      const { data, error } = await supabase
        .from('dre_account_groups' as any)
        .select('*')
        .eq('organization_id', organizationId)
        .order('display_order', { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as DREAccountGroup[];
    },
    enabled: !!organizationId
  });
}

export function useDREMappings() {
  const { profile } = useAuth();
  const organizationId = profile?.organization_id;

  return useQuery({
    queryKey: ['dre-mappings', organizationId],
    queryFn: async () => {
      if (!organizationId) throw new Error('No organization');

      const { data, error } = await supabase
        .from('dre_account_mappings' as any)
        .select('*, group:group_id(id, name, group_type)')
        .eq('organization_id', organizationId);

      if (error) throw error;
      return (data || []) as unknown as (DREAccountMapping & { group: DREAccountGroup | null })[];
    },
    enabled: !!organizationId
  });
}

export function useInitializeDREGroups() {
  const { profile } = useAuth();

  const initializeGroups = async () => {
    if (!profile?.organization_id) return;

    const { error } = await supabase.rpc('copy_default_dre_groups' as any, {
      org_id: profile.organization_id
    });

    if (error) throw error;
  };

  return { initializeGroups };
}
