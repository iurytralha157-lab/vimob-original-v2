import { useMemo, useState } from 'react';
import { endOfDay, format, startOfDay, startOfMonth } from 'date-fns';
import { Activity, Building2, CheckCircle2, DollarSign, RefreshCw, Target, TrendingUp, Users } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { OrgsGrowthChart } from '@/components/admin/dashboard/OrgsGrowthChart';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DateFilterPopover } from '@/components/ui/date-filter-popover';
import { DatePreset, getDateRangeFromPreset } from '@/hooks/use-dashboard-filters';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const fmtBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(n || 0);

const fmtNum = (n: number) => new Intl.NumberFormat('pt-BR').format(n || 0);

type AdminDashboardData = {
  revenue: number;
  mrr: number;
  totalOrgs: number;
  activeOrgs: number;
  leads: number;
  activeUsers: number;
  automations: number;
  accesses: number;
  organizationFlow: Array<{ date: string; created: number; active: number; disabled: number }>;
  bucket: 'dia' | 'mês';
};

export default function AdminDashboard() {
  const [datePreset, setDatePreset] = useState<DatePreset | null>('thisYear');
  const [customDateRange, setCustomDateRange] = useState<{ from: Date; to: Date } | null>(null);
  const qc = useQueryClient();

  const dateRange = useMemo(() => {
    if (datePreset === 'custom' && customDateRange) {
      return { from: startOfDay(customDateRange.from), to: endOfDay(customDateRange.to) };
    }
    return getDateRangeFromPreset(datePreset || 'thisYear');
  }, [customDateRange, datePreset]);

  const dashboard = useAdminDashboardData(dateRange);

  const kpis = useMemo(() => {
    const data = dashboard.data;
    return [
      {
        title: 'Receita',
        value: fmtBRL(data?.revenue ?? 0),
        icon: DollarSign,
        color: 'primary',
        tooltip: 'Pagamentos confirmados no período filtrado',
      },
      {
        title: 'MRR',
        value: fmtBRL(data?.mrr ?? 0),
        icon: TrendingUp,
        color: 'chart-3',
        tooltip: 'Receita mensal recorrente das organizações ativas',
      },
      {
        title: 'Organizações',
        value: fmtNum(data?.totalOrgs ?? 0),
        icon: Building2,
        color: 'chart-2',
        tooltip: 'Total de organizações cadastradas',
      },
      {
        title: 'Ativas',
        value: fmtNum(data?.activeOrgs ?? 0),
        icon: CheckCircle2,
        color: 'chart-3',
        tooltip: 'Organizações ativas',
      },
      {
        title: 'Leads',
        value: fmtNum(data?.leads ?? 0),
        icon: Target,
        color: 'chart-4',
        tooltip: 'Leads recebidos no período filtrado',
      },
      {
        title: 'Usuários no período',
        value: fmtNum(data?.activeUsers ?? 0),
        icon: Users,
        color: 'chart-1',
        tooltip: 'Usuários distintos com atividade registrada no período filtrado',
      },
      {
        title: 'Automações',
        value: fmtNum(data?.automations ?? 0),
        icon: Activity,
        color: 'chart-5',
        tooltip: 'Automações executadas no período filtrado',
      },
      {
        title: 'Acessos',
        value: fmtNum(data?.accesses ?? 0),
        icon: Users,
        color: 'chart-2',
        tooltip: 'Logins e início de sessão no período filtrado',
      },
    ];
  }, [dashboard.data]);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['admin-dashboard-direct'] });
  };

  return (
    <AdminLayout title="Dashboard">
      <div className="w-full max-w-[1600px] space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Receita, entrada e uso da plataforma no período selecionado.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DateFilterPopover
              datePreset={datePreset}
              onDatePresetChange={setDatePreset}
              customDateRange={customDateRange}
              onCustomDateRangeChange={setCustomDateRange}
              defaultPreset="thisYear"
              align="end"
              triggerClassName="bg-card"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={refreshAll}
              disabled={dashboard.isFetching}
              className="h-9 w-9 rounded-lg bg-card"
              aria-label="Atualizar"
            >
              <RefreshCw className={cn('h-4 w-4', dashboard.isFetching && 'animate-spin')} />
            </Button>
          </div>
        </div>

        <DashboardKpiGrid items={kpis} loading={dashboard.isLoading} />

        <OrgsGrowthChart
          data={dashboard.data?.organizationFlow}
          loading={dashboard.isLoading}
          bucket={dashboard.data?.bucket}
        />
      </div>
    </AdminLayout>
  );
}

function useAdminDashboardData(dateRange: { from: Date; to: Date }) {
  const from = dateRange.from.toISOString();
  const to = dateRange.to.toISOString();

  return useQuery({
    queryKey: ['admin-dashboard-direct', from, to],
    queryFn: async (): Promise<AdminDashboardData> => {
      const fromDate = from.slice(0, 10);
      const toDate = to.slice(0, 10);

      const [
        financialResult,
        orgsResult,
        adminOrgsResult,
        leadsResult,
        auditResult,
        automationsResult,
        plansResult,
      ] = await Promise.all([
        (supabase as any)
          .from('financial_entries')
          .select('amount, paid_amount, paid_date, status, type')
          .eq('status', 'paid')
          .eq('type', 'income')
          .gte('paid_date', fromDate)
          .lte('paid_date', toDate),
        (supabase as any)
          .from('organizations')
          .select('id, is_active, subscription_status, subscription_type, plan_id, created_at, updated_at')
          .gte('created_at', from)
          .lte('created_at', to),
        (supabase.rpc as any)('admin_list_organizations', {
          p_search: '',
          p_status: 'all',
          p_segment: 'all',
        }),
        (supabase as any)
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', from)
          .lte('created_at', to),
        (supabase as any)
          .from('audit_logs')
          .select('user_id, action, created_at')
          .gte('created_at', from)
          .lte('created_at', to),
        (supabase as any)
          .from('automation_runs')
          .select('id', { count: 'exact', head: true })
          .gte('started_at', from)
          .lte('started_at', to),
        (supabase as any)
          .from('admin_subscription_plans')
          .select('id, price'),
      ]);

      const firstError = [
        financialResult.error,
        orgsResult.error,
        adminOrgsResult.error,
        leadsResult.error,
        auditResult.error,
        automationsResult.error,
        plansResult.error,
      ].find(Boolean);
      if (firstError) throw firstError;

      const financialEntries = financialResult.data || [];
      const filteredOrgs = orgsResult.data || [];
      const adminOrgs = adminOrgsResult.data || [];
      const auditLogs = auditResult.data || [];
      const planPrices = new Map((plansResult.data || []).map((plan: any) => [plan.id, Number(plan.price) || 0]));

      const revenue = financialEntries.reduce(
        (sum: number, entry: any) => sum + Number(entry.paid_amount ?? entry.amount ?? 0),
        0,
      );

      const directMrr = filteredOrgs.reduce((sum: number, org: any) => {
        if (!org.is_active || org.subscription_type !== 'paid' || !org.plan_id) return sum;
        return sum + (planPrices.get(org.plan_id) || 0);
      }, 0);

      const adminMrr = adminOrgs.reduce((sum: number, org: any) => sum + Number(org.mrr || 0), 0);
      const activeOrgs = adminOrgs.length
        ? adminOrgs.filter((org: any) => org.is_active && org.subscription_status === 'active').length
        : filteredOrgs.filter((org: any) => org.is_active && org.subscription_status === 'active').length;
      const totalLeads = adminOrgs.reduce((sum: number, org: any) => sum + Number(org.lead_count || 0), 0);
      const totalAutomations = adminOrgs.reduce((sum: number, org: any) => sum + Number(org.automation_count || 0), 0);
      const activeUsers = new Set(auditLogs.map((log: any) => log.user_id).filter(Boolean)).size;
      const accesses = auditLogs.filter((log: any) => log.action === 'login' || log.action === 'session.start').length;
      const bucket = getBucket(dateRange.from, dateRange.to);
      const flowSource = filteredOrgs.length
        ? filteredOrgs
        : adminOrgs.filter((org: any) => {
            if (!org.created_at) return false;
            const createdAt = new Date(org.created_at);
            return createdAt >= dateRange.from && createdAt <= dateRange.to;
          });
      const organizationFlow = buildOrganizationFlow(flowSource, bucket);

      return {
        revenue,
        mrr: adminMrr || directMrr,
        totalOrgs: adminOrgs.length || filteredOrgs.length,
        activeOrgs,
        leads: totalLeads || leadsResult.count || 0,
        activeUsers,
        automations: totalAutomations || automationsResult.count || 0,
        accesses,
        organizationFlow,
        bucket,
      };
    },
    staleTime: 60_000,
  });
}

function getBucket(from: Date, to: Date): 'dia' | 'mês' {
  const days = Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
  return days > 120 ? 'mês' : 'dia';
}

function buildOrganizationFlow(orgs: any[], bucket: 'dia' | 'mês') {
  const map = new Map<string, { date: string; created: number; active: number; disabled: number }>();

  const ensureRow = (key: string) => {
    if (!map.has(key)) {
      map.set(key, { date: key, created: 0, active: 0, disabled: 0 });
    }
    return map.get(key)!;
  };

  orgs.forEach((org) => {
    if (!org.created_at) return;
    const createdAt = new Date(org.created_at);
    const key = bucket === 'mês'
      ? format(startOfMonth(createdAt), 'yyyy-MM-01')
      : format(createdAt, 'yyyy-MM-dd');
    const row = ensureRow(key);

    row.created += 1;
    if (org.is_active && org.subscription_status === 'active') row.active += 1;
    if (!org.is_active || org.subscription_status === 'cancelled') row.disabled += 1;
  });

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function DashboardKpiGrid({ items, loading }: { items: any[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <Skeleton className="mb-3 h-3 w-20" />
              <Skeleton className="h-7 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <TooltipProvider key={item.title}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Card className="card-hover h-full cursor-default">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="mb-1 truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          {item.title}
                        </p>
                        <p className="truncate text-2xl font-bold leading-tight">{item.value}</p>
                      </div>
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `hsl(var(--${item.color}) / 0.1)` }}
                      >
                        <Icon className="h-5 w-5" style={{ color: `hsl(var(--${item.color}))` }} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{item.tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}



