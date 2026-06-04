import { AppLayout } from "@/components/layout/AppLayout";
import { useConstructionProjects, useAllMilestones } from "@/hooks/use-construction";
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
  Calendar,
  Layers,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";
import { 
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { Badge } from "@/components/ui/badge";
import { format, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

import { SharedFilters } from "@/components/shared/SharedFilters";
import { useSharedFilters } from "@/hooks/use-shared-filters";

import { DashboardAlertBar } from "@/components/dashboard/DashboardAlertBar";

export default function EngineeringDashboard() {
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

  const { data: projects, isLoading: projectsLoading } = useConstructionProjects();
  const { data: milestones, isLoading: milestonesLoading } = useAllMilestones(filters.dateRange);
  const { data: engineeringRequests } = useOperationalRequests({ type: 'engineering', dateRange: filters.dateRange });

  const isLoading = projectsLoading || milestonesLoading;

  const mockSData = [
    { name: 'Jan', previsto: 5, realizado: 4 },
    { name: 'Fev', previsto: 15, realizado: 12 },
    { name: 'Mar', previsto: 30, realizado: 28 },
    { name: 'Abr', previsto: 45, realizado: 42 },
    { name: 'Mai', previsto: 60, realizado: 58 },
    { name: 'Jun', previsto: 75, realizado: 70 },
  ];

  if (isLoading) {
    return (
      <AppLayout title="Dashboard de Engenharia">
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const plannedProjects = projects?.filter(p => p.status === 'planned' || p.status === 'waiting') || [];
  const inProgressProjects = projects?.filter(p => p.status === 'in_progress' || p.status === 'active') || [];
  const finishedProjects = projects?.filter(p => p.status === 'completed' || p.status === 'finished') || [];

  return (
    <AppLayout title="Dashboard de Engenharia">
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
          <StatCard title="Obras a Iniciar" value={plannedProjects.length} icon={Calendar} color="text-blue-600" />
          <StatCard title="Em Execução" value={inProgressProjects.length} icon={HardHat} color="text-orange-600" />
          <StatCard title="Projetos Técnicos" value={engineeringRequests?.length || 0} icon={Layers} color="text-purple-600" />
          <StatCard title="Obras Finalizadas" value={finishedProjects.length} icon={CheckCircle2} color="text-emerald-600" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Curva S */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Curva S (Previsto vs Realizado)</CardTitle>
              <CardDescription>Evolução física consolidada das obras</CardDescription>
            </CardHeader>
            <CardContent className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mockSData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis unit="%" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="previsto" stroke="#94a3b8" strokeWidth={2} dot={{ r: 4 }} name="Previsto" />
                  <Line type="monotone" dataKey="realizado" stroke="#f59e0b" strokeWidth={3} dot={{ r: 6 }} name="Realizado" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Projetos Complementares */}
          <Card>
            <CardHeader>
              <CardTitle>Solicitações de Engenharia</CardTitle>
              <CardDescription>Status das solicitações operacionais</CardDescription>
            </CardHeader>
            <CardContent>
               <div className="space-y-4">
                  {engineeringRequests?.slice(0, 6).map((req: any) => (
                    <ProjectStatusItem key={req.id} label={req.title} status={req.status} />
                  ))}
                  {(!engineeringRequests || engineeringRequests.length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhuma solicitação encontrada</p>
                  )}
               </div>
            </CardContent>
          </Card>
        </div>

        {/* Cronograma / Gantt Simplificado */}
        <Card>
          <CardHeader>
            <CardTitle>Linha do Tempo das Obras</CardTitle>
            <CardDescription>Cronograma macro e marcos críticos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-8 py-4">
              {inProgressProjects.map((project: any, idx: number) => (
                <div key={idx} className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-sm font-bold">{project.name}</h4>
                      <p className="text-[10px] text-muted-foreground">
                        Início: {project.start_date_planned ? format(new Date(project.start_date_planned), 'dd/MM/yyyy') : 'N/A'} | 
                        Fim: {project.end_date_planned ? format(new Date(project.end_date_planned), 'dd/MM/yyyy') : 'N/A'}
                      </p>
                    </div>
                    <Badge variant="outline">{project.physical_progress_percent}% Concluído</Badge>
                  </div>
                  <div className="relative h-10 bg-muted/30 rounded-lg flex items-center px-2">
                    <div 
                      className="h-6 bg-orange-500/20 border-r-2 border-orange-500 rounded flex items-center px-2 text-[10px] font-bold text-orange-700"
                      style={{ width: `${project.physical_progress_percent}%` }}
                    >
                      {project.physical_progress_percent}%
                    </div>
                    {/* Marcos (Milestones) seriam mapeados aqui */}
                    {milestones?.filter((m: any) => m.project_id === project.id).map((m: any, midx: number) => {
                      // Cálculo simplificado de posição baseado no tempo
                      return (
                        <div 
                          key={m.id} 
                          className={`absolute h-2 w-2 rounded-full ${m.status === 'completed' ? 'bg-emerald-500' : 'bg-slate-300'}`}
                          style={{ left: `${(midx + 1) * 20}%`, top: '16px' }}
                          title={m.name}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
              {inProgressProjects.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma obra em andamento</p>
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

function ProjectStatusItem({ label, status }: { label: string, status: string }) {
  const getBadge = () => {
    switch (status) {
      case 'completed': 
      case 'approved': return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none text-[10px]">Aprovado</Badge>;
      case 'in_analysis':
      case 'in_progress': return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-none text-[10px]">Em Análise</Badge>;
      case 'rejected': return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-none text-[10px]">Rejeitado</Badge>;
      default: return <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 border-none text-[10px]">Pendente</Badge>;
    }
  };

  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs font-medium truncate max-w-[150px]">{label}</span>
      {getBadge()}
    </div>
  );
}
