import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, eachDayOfInterval, parseISO } from 'date-fns';

import { checkLeadVisibility, applyVisibilityFilter } from './use-lead-visibility';

export interface TelecomDashboardStats {
  totalCustomers: number;
  activeCustomers: number; // INSTALADOS
  conversionRate: number;
  monthlyRecurringRevenue: number; // Soma do plan_value de clientes INSTALADOS
  customersTrend: number;
  activeTrend: number;
  conversionTrend: number;
}

export interface TelecomEvolutionPoint {
  date: string;
  novos: number;
  instalados: number;
  aguardando: number;
  em_analise: number;
  cancelado: number;
  suspenso: number;
  inadimplente: number;
}

interface DashboardFilters {
  dateRange?: { from: Date; to: Date };
  dateFrom?: Date;
  dateTo?: Date;
  teamId?: string | null;
  userId?: string | null;
}

export function useTelecomDashboardStats(filters?: DashboardFilters) {
  const { organization, profile } = useAuth();

  return useQuery({
    queryKey: ['telecom-dashboard-stats', organization?.id, filters, profile?.id],
    queryFn: async () => {
      if (!organization?.id || !profile?.id) {
        return {
          totalCustomers: 0,
          activeCustomers: 0,
          conversionRate: 0,
          monthlyRecurringRevenue: 0,
          customersTrend: 0,
          activeTrend: 0,
          conversionTrend: 0,
        };
      }

      // Get visibility level (admin, team leader, or normal user)
      const visibility = await checkLeadVisibility(profile.id);

      // Build base query conditions
      const buildQuery = (baseQuery: any) => {
        let q = baseQuery.eq('organization_id', organization.id);
        
        // Apply visibility filter or explicit user filter
        if (filters?.userId) {
          q = q.eq('seller_id', filters.userId);
        } else {
          q = applyVisibilityFilter(q, visibility, 'seller_id');
        }
        
        return q;
      };

      // Current period counts
      const [
        { count: total },
        { count: instalados },
        { data: mrrData },
      ] = await Promise.all([
        buildQuery(
          supabase.from('telecom_customers').select('*', { count: 'exact', head: true })
        ),
        buildQuery(
          supabase.from('telecom_customers').select('*', { count: 'exact', head: true })
        ).eq('status', 'INSTALADOS'),
        buildQuery(
          supabase.from('telecom_customers').select('plan_value')
        ).eq('status', 'INSTALADOS'),
      ]);

      // Calculate MRR
      const mrr = (mrrData || []).reduce((sum, c) => sum + (c.plan_value || 0), 0);

      // Conversion rate: instalados / total
      const conversionRate = total && total > 0 
        ? Number(((instalados || 0) / total * 100).toFixed(1)) 
        : 0;

      // Previous period for trends (30 days ago)
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      const [
        { count: prevTotal },
        { count: prevInstalados },
      ] = await Promise.all([
        buildQuery(
          supabase.from('telecom_customers').select('*', { count: 'exact', head: true })
        ).lt('created_at', thirtyDaysAgo.toISOString()),
        buildQuery(
          supabase.from('telecom_customers').select('*', { count: 'exact', head: true })
        ).eq('status', 'INSTALADOS').lt('created_at', thirtyDaysAgo.toISOString()),
      ]);

      // Calculate trends
      const customersTrend = prevTotal && prevTotal > 0
        ? Math.round(((total || 0) - prevTotal) / prevTotal * 100)
        : 0;
      
      const activeTrend = prevInstalados && prevInstalados > 0
        ? Math.round(((instalados || 0) - prevInstalados) / prevInstalados * 100)
        : 0;

      const prevConversion = prevTotal && prevTotal > 0 
        ? (prevInstalados || 0) / prevTotal * 100 
        : 0;
      const conversionTrend = prevConversion > 0
        ? Math.round((conversionRate - prevConversion) / prevConversion * 100)
        : 0;

      return {
        totalCustomers: total || 0,
        activeCustomers: instalados || 0,
        conversionRate,
        monthlyRecurringRevenue: mrr,
        customersTrend,
        activeTrend,
        conversionTrend,
      };
    },
    enabled: !!organization?.id,
  });
}

export function useTelecomEvolutionData(filters?: DashboardFilters) {
  const { organization, profile } = useAuth();

  return useQuery({
    queryKey: ['telecom-evolution-data', organization?.id, filters, profile?.id],
    queryFn: async (): Promise<TelecomEvolutionPoint[]> => {
      if (!organization?.id || !profile?.id) return [];

      // Get visibility level (admin, team leader, or normal user)
      const visibility = await checkLeadVisibility(profile.id);

      // Determine date range - support both dateRange and dateFrom/dateTo formats
      const dateTo = filters?.dateRange?.to || filters?.dateTo || new Date();
      const dateFrom = filters?.dateRange?.from || filters?.dateFrom || new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Build query
      let query = supabase
        .from('telecom_customers')
        .select('created_at, status, installation_date')
        .eq('organization_id', organization.id)
        .gte('created_at', dateFrom.toISOString())
        .lte('created_at', dateTo.toISOString());

      // Apply visibility filter or explicit user filter
      if (filters?.userId) {
        query = query.eq('seller_id', filters.userId);
      } else {
        query = applyVisibilityFilter(query, visibility, 'seller_id');
      }

      const { data: customers, error } = await query;

      if (error) {
        console.error('Error fetching telecom evolution:', error);
        return [];
      }

      if (!customers || customers.length === 0) return [];

      // Always use daily grouping for bar chart visibility
      const intervals = eachDayOfInterval({ start: dateFrom, end: dateTo });
      const formatPattern = 'dd/MM';
      const getIntervalKey = (date: Date) => format(date, 'yyyy-MM-dd');

      // Group customers by interval and status at creation time
      const grouped = new Map<string, TelecomEvolutionPoint>();

      intervals.forEach((interval) => {
        const key = getIntervalKey(interval);
        grouped.set(key, {
          date: format(interval, formatPattern),
          novos: 0,
          instalados: 0,
          aguardando: 0,
          em_analise: 0,
          cancelado: 0,
          suspenso: 0,
          inadimplente: 0,
        });
      });

      // Agrupar clientes por status atual na data de criação
      // Isso mostra "quantos clientes criados em cada período estão em cada status hoje"
      customers.forEach((customer) => {
        const createdDate = parseISO(customer.created_at);
        const key = getIntervalKey(createdDate);
        const point = grouped.get(key);
        
        if (point) {
          // Mapear status para o campo correto
          const status = customer.status?.toUpperCase();
          
          switch (status) {
            case 'NOVO':
            case 'NOVOS':
              point.novos++;
              break;
            case 'INSTALADOS':
            case 'INSTALADO':
              point.instalados++;
              break;
            case 'AGUARDANDO':
              point.aguardando++;
              break;
            case 'EM_ANALISE':
            case 'EM ANÁLISE':
              point.em_analise++;
              break;
            case 'CANCELADO':
            case 'CANCELADOS':
              point.cancelado++;
              break;
            case 'SUSPENSO':
            case 'SUSPENSOS':
              point.suspenso++;
              break;
            case 'INADIMPLENTE':
            case 'INADIMPLENTES':
              point.inadimplente++;
              break;
            default:
              // Status não mapeado, conta como novo
              point.novos++;
          }
        }
      });

      return Array.from(grouped.values());
    },
    enabled: !!organization?.id,
  });
}
