import { AppLayout } from "@/components/layout/AppLayout";
import { useOperationalRequests } from "@/hooks/use-operational";
import { useConstructionProjects } from "@/hooks/use-construction";

import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from "@/components/ui/card";
import { 
  Loader2, 
  Compass,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format, differenceInDays } from "date-fns";

import { SharedFilters } from "@/components/shared/SharedFilters";
import { useSharedFilters } from "@/hooks/use-shared-filters";

import { DashboardAlertBar } from "@/components/dashboard/DashboardAlertBar";

export default function ArchitectureDashboard() {
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

  const { data: requests, isLoading: isLoadingRequests } = useOperationalRequests({ type: 'architecture', dateRange: filters.dateRange });
  const { data: allProjects, isLoading: isLoadingProjects } = useConstructionProjects();

  const isLoading = isLoadingRequests || isLoadingProjects;

  if (isLoading) {
    return (
      <AppLayout title="Dashboard de Arquitetura">
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const architectureProjects = allProjects?.filter(p => (p as any).project_type === 'architecture') || [];
  const activeProjects = architectureProjects.filter(p => p.status !== 'completed' && p.status !== 'cancelled');
  const cityHallProtocols = architectureProjects.filter(p => (p as any).city_hall_approval_date);
  const completedProjects = architectureProjects.filter(p => p.status === 'completed');


  // Cálculo de SLA médio (dias entre criação e conclusão ou hoje)
  const totalDays = requests?.reduce((acc, r) => {
    const end = r.completed_at ? new Date(r.completed_at) : new Date();
    return acc + differenceInDays(end, new Date(r.created_at));
  }, 0) || 0;
  const avgSla = requests?.length ? Math.round(totalDays / requests.length) : 0;

  const pendingReviews = requests?.filter(r => r.status === 'in_analysis').length || 0;

  return (
    <AppLayout title="Dashboard de Arquitetura">
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Projetos Ativos" value={activeProjects.length} icon={Compass} color="text-blue-600" />
          <StatCard title="Protocolos Prefeitura" value={cityHallProtocols.length} icon={FileText} color="text-orange-600" />
          <StatCard title="SLA Médio" value={`${avgSla} dias`} icon={Clock} color="text-purple-600" />
          <StatCard title="Em Revisão" value={pendingReviews} icon={AlertCircle} color="text-red-600" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Projetos em Andamento */}
          <Card>
            <CardHeader>
              <CardTitle>Projetos em Andamento</CardTitle>
              <CardDescription>Fluxo de criação e detalhamento técnico</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                 {activeProjects.slice(0, 5).map((p) => (
                   <div key={p.id} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm truncate">{p.name}</h4>
                          <p className="text-[11px] text-muted-foreground">
                            {p.property?.title || 'Sem imóvel'} | Entrega: {p.end_date_planned ? format(new Date(p.end_date_planned), 'dd/MM/yyyy') : 'N/A'}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-[10px] whitespace-nowrap">{getStatusLabel(p.status)}</Badge>
                      </div>

                      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div className={`h-full transition-all ${getProgressColor(p.status)}`} style={{ width: `${getProgressValue(p.status)}%` }} />
                      </div>
                   </div>
                 ))}
                 {activeProjects.length === 0 && (
                   <p className="text-sm text-muted-foreground text-center py-4">Nenhum projeto em andamento</p>
                 )}
              </div>
            </CardContent>
          </Card>

          {/* Protocolos Prefeitura */}
          <Card>
            <CardHeader>
              <CardTitle>Protocolos e Alvarás</CardTitle>
              <CardDescription>Monitoramento de liberações legais (Prefeitura)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                   <thead>
                      <tr className="text-left text-[10px] uppercase font-bold text-slate-500 border-b">
                        <th className="pb-3">Projeto / Obra</th>
                        <th className="pb-3 text-right">Dias em Aberto</th>
                        <th className="pb-3 text-right">Status</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y">
                      {cityHallProtocols.slice(0, 5).map((pt) => {
                        const days = differenceInDays(new Date(), new Date(pt.created_at));
                        return (
                          <tr key={pt.id}>
                            <td className="py-3">
                              <p className="font-medium text-xs truncate max-w-[150px]">{pt.name}</p>
                              <p className="text-[10px] text-slate-400">{pt.property?.title || 'N/A'}</p>
                            </td>
                            <td className={`py-3 text-right text-xs font-bold ${days > 30 ? 'text-red-500' : 'text-slate-600'}`}>

                              {days}
                            </td>
                            <td className="py-3 text-right">
                               <Badge variant="outline" className="text-[10px]">{getStatusLabel(pt.status)}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                      {cityHallProtocols.length === 0 && (
                        <tr>
                          <td colSpan={3} className="text-sm text-muted-foreground text-center py-8">Nenhum protocolo encontrado</td>
                        </tr>
                      )}
                   </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Repositório de Plantas Aprovadas */}
        <Card>
          <CardHeader>
            <CardTitle>Últimos Projetos Entregues</CardTitle>
            <CardDescription>Trabalhos finalizados e liberados para obra</CardDescription>
          </CardHeader>
          <CardContent>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 {completedProjects.slice(0, 3).map((cp) => (
                   <FileItem 
                     key={cp.id} 
                     name={cp.name} 
                     date={format(new Date(cp.delivery_date_actual || cp.updated_at), 'dd/MM/yyyy')} 
                     size="-" 
                   />

                ))}
                {completedProjects.length === 0 && (
                  <p className="col-span-3 text-sm text-muted-foreground text-center py-4">Nenhum projeto entregue recentemente</p>
                )}
             </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function StatCard({ title, value, icon: Icon, color }: any) {
  return (
    <Card className="shadow-sm border-none bg-white">
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center bg-slate-50`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</p>
            <h3 className={`text-xl font-black ${color}`}>{value}</h3>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FileItem({ name, date, size }: { name: string, date: string, size: string }) {
  return (
    <div className="p-3 border rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-3">
       <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center">
          <FileText className="h-5 w-5 text-red-600" />
       </div>
       <div className="min-w-0">
          <p className="text-xs font-bold truncate">{name}</p>
          <p className="text-[10px] text-muted-foreground">{date} • {size}</p>
       </div>
    </div>
  );
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: 'Pendente',
    in_analysis: 'Em Revisão',
    approved: 'Aprovado',
    rejected: 'Recusado',
    completed: 'Entregue',
    in_progress: 'Em Execução'
  };
  return labels[status] || status;
}

function getProgressValue(status: string) {
  const values: Record<string, number> = {
    pending: 10,
    in_analysis: 40,
    in_progress: 70,
    approved: 90,
    completed: 100
  };
  return values[status] || 0;
}

function getProgressColor(status: string) {
  if (status === 'completed' || status === 'approved') return 'bg-emerald-500';
  if (status === 'rejected') return 'bg-red-500';
  return 'bg-blue-600';
}
