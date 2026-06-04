import { AppLayout } from "@/components/layout/AppLayout";
import { useEnterpriseKPIs } from "@/hooks/use-enterprise-kpis";
import { useOperationalRequests } from "@/hooks/use-operational";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from "@/components/ui/card";
import { 
  Loader2, 
  HardHat,
  Wallet,
  Compass,
  ShoppingCart,
  TrendingUp,
  BarChart3,
  Clock,
  ChevronRight
} from "lucide-react";
import { 
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

import { SharedFilters } from "@/components/shared/SharedFilters";
import { useSharedFilters } from "@/hooks/use-shared-filters";

import { DashboardAlertBar } from "@/components/dashboard/DashboardAlertBar";

export default function ObrasOverview() {
  const {
    filters,
    datePreset,
    setDatePreset,
    customDateRange,
    setCustomDateRange,
    teamId,
    setTeamId,
    userId,
    setUserId,
    source,
    setSource,
    campaignId,
    setCampaignId,
    adSetId,
    setAdSetId,
    adId,
    setAdId,
    tagId,
    setTagId,
    dealStatus,
    setDealStatus,
    searchQuery,
    setSearchQuery,
    clearFilters,
    hasActiveFilters,
    dynamicSources,
    campaigns,
    adSets,
    ads,
    tags,
    isLoadingSources,
    isLoadingCampaigns,
    isLoadingAdSets,
    isLoadingAds,
  } = useSharedFilters();

  const { data: kpis, isLoading: isLoadingKPIs } = useEnterpriseKPIs(filters.dateRange);
  const { data: requests, isLoading: isLoadingRequests } = useOperationalRequests();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

  const requestStats = [
    { name: 'Financeiro', value: requests?.filter(r => r.type === 'finance').length || 0 },
    { name: 'Arquitetura', value: requests?.filter(r => r.type === 'architecture').length || 0 },
    { name: 'Engenharia', value: requests?.filter(r => r.type === 'engineering').length || 0 },
    { name: 'Compras', value: requests?.filter(r => r.type === 'purchase').length || 0 },
  ].filter(s => s.value > 0);

  if (isLoadingKPIs || isLoadingRequests) {
    return (
      <AppLayout title="Overview de Obras">
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Visão Geral - Obras">
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <DashboardAlertBar />
          <div className="flex-1" />
          <SharedFilters 
            datePreset={datePreset}
            onDatePresetChange={setDatePreset}
            customDateRange={customDateRange}
            onCustomDateRangeChange={setCustomDateRange}
            teamId={teamId}
            onTeamChange={setTeamId}
            userId={userId}
            onUserChange={setUserId}
            source={source}
            onSourceChange={setSource}
            campaignId={campaignId}
            onCampaignChange={setCampaignId}
            adSetId={adSetId}
            onAdSetChange={setAdSetId}
            adId={adId}
            onAdChange={setAdId}
            tagId={tagId}
            onTagChange={setTagId}
            dealStatus={dealStatus}
            onDealStatusChange={setDealStatus}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onClear={clearFilters}
            hasActiveFilters={hasActiveFilters}
            dynamicSources={dynamicSources}
            campaigns={campaigns}
            adSets={adSets}
            ads={ads}
            tags={tags}
            isLoadingSources={isLoadingSources}
            isLoadingCampaigns={isLoadingCampaigns}
            isLoadingAdSets={isLoadingAdSets}
            isLoadingAds={isLoadingAds}
          />

        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KPICard 
            title="Obras Ativas" 
            value={kpis?.engineering?.total_active || 0} 
            icon={HardHat} 
            color="text-orange-600" 
            bg="bg-orange-100" 
          />
          <KPICard 
            title="EBITDA Acumulado" 
            value={formatCurrency(kpis?.financial?.ebitda || 0)} 
            icon={TrendingUp} 
            color="text-emerald-600" 
            bg="bg-emerald-100" 
          />
          <KPICard 
            title="ROI Médio" 
            value={`${((kpis?.financial?.roi_overview || 0) * 100).toFixed(1)}%`} 
            icon={BarChart3} 
            color="text-blue-600" 
            bg="bg-blue-100" 
          />
          <KPICard 
            title="Solicitações" 
            value={requests?.length || 0} 
            icon={Clock} 
            color="text-purple-600" 
            bg="bg-purple-100" 
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Cash Flow */}
          <Card>
            <CardHeader>
              <CardTitle>Fluxo de Caixa Consolidado</CardTitle>
              <CardDescription>Receitas vs Despesas de todas as obras</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: 'Receita', valor: kpis?.financial?.revenue || 0, fill: '#10b981' },
                  { name: 'Despesa', valor: kpis?.financial?.expense || 0, fill: '#ef4444' },
                  { name: 'EBITDA', valor: kpis?.financial?.ebitda || 0, fill: '#3b82f6' },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="valor" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Request Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Solicitações por Setor</CardTitle>
              <CardDescription>Distribuição de gargalos operacionais</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px] flex items-center justify-center">
              {requestStats.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={requestStats}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {requestStats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="fill-foreground font-bold text-xl">
                      {requests?.length}
                    </text>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground italic">Sem solicitações ativas.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Active Projects List */}
        <Card>
          <CardHeader>
            <CardTitle>Obras em Andamento</CardTitle>
            <CardDescription>Resumo de progresso físico e status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {kpis?.engineering?.projects?.map((project: any, idx: number) => (
                <div 
                  key={idx} 
                  className="flex items-center gap-4 cursor-pointer hover:bg-slate-50 p-2 rounded-lg transition-colors"
                  onClick={() => window.location.href = `/obras/obras/${project.id}`}
                >
                  <div className="w-48 shrink-0 font-medium truncate flex items-center gap-2">
                    {project.name}
                    <ChevronRight className="h-3 w-3 text-slate-400" />
                  </div>
                  <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-orange-500 transition-all duration-1000" 
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                  <div className="w-12 text-right text-sm font-bold">{project.progress}%</div>
                </div>
              ))}
              {(!kpis?.engineering?.projects || kpis.engineering.projects.length === 0) && (
                <p className="text-center py-8 text-muted-foreground italic">Nenhuma obra cadastrada.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function KPICard({ title, value, icon: Icon, color, bg }: any) {
  return (
    <Card className="hover:shadow-md transition-all border-none bg-white shadow-sm">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</p>
            <h3 className={`text-2xl font-black mt-1 ${color}`}>{value}</h3>
          </div>
          <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${bg}`}>
            <Icon className={`h-6 w-6 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
