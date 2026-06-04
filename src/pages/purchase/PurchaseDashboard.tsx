import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { useAllPurchaseOrders, useAllMilestones } from "@/hooks/use-construction";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from "@/components/ui/card";
import { 
  Loader2, 
  ShoppingCart,
  Package,
  Truck,
  DollarSign,
  AlertTriangle,
  TrendingDown
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell
} from 'recharts';
import { format, isAfter, addDays, isBefore } from "date-fns";

import { SharedFilters } from "@/components/shared/SharedFilters";
import { useSharedFilters } from "@/hooks/use-shared-filters";

import { DashboardAlertBar } from "@/components/dashboard/DashboardAlertBar";

export default function PurchaseDashboard() {
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

  const { data: orders, isLoading: ordersLoading } = useAllPurchaseOrders(filters.dateRange);
  const { data: milestones, isLoading: milestonesLoading } = useAllMilestones(filters.dateRange);

  const isLoading = ordersLoading || milestonesLoading;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val);
  };

  if (isLoading) {
    return (
      <AppLayout title="Dashboard de Compras">
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const openOrders = orders?.filter(o => o.status === 'pending' || o.status === 'approved') || [];
  const waitingDelivery = orders?.filter(o => o.status === 'ordered' || o.status === 'partially_delivered') || [];
  
  const monthlyCost = orders?.filter(o => {
    const date = new Date(o.created_at);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }).reduce((acc, o) => acc + (Number(o.net_amount) || 0), 0) || 0;

  // Cálculo de Saving: Usando discount_amount como proxy ou diferença entre total e net
  const totalSaving = orders?.reduce((acc, o) => {
    const directSaving = Number((o as any).saving_amount) || 0;
    if (directSaving > 0) return acc + directSaving;

    const discount = Number(o.discount_amount) || 0;
    const estimated = Number((o as any).estimated_cost) || 0;
    const netAmount = Number(o.net_amount) || 0;
    const totalAmount = Number(o.total_amount) || 0;
    
    const diff = (estimated > 0 && estimated > netAmount) 
      ? estimated - netAmount 
      : (totalAmount > netAmount ? totalAmount - netAmount : 0);
    
    return acc + Math.max(discount, diff);
  }, 0) || 0;


  const urgencyOrders = 0; // Campo de prioridade não disponível no momento

  // Dados para o gráfico de custos por obra
  const projectsCosts: Record<string, number> = {};
  orders?.forEach(o => {
    const projectName = o.project?.name || 'Sem Obra';
    projectsCosts[projectName] = (projectsCosts[projectName] || 0) + (Number(o.net_amount) || 0);
  });

  const costsData = Object.entries(projectsCosts).map(([name, value]) => ({ name, value }));

  // Necessidades baseadas em milestones (próximos 15 dias)
  const nextNeeds = milestones?.filter(m => {
    const start = new Date(m.start_date);
    const now = new Date();
    return isAfter(start, now) && isBefore(start, addDays(now, 15));
  }).map(m => ({
    obra: m.project?.name,
    material: m.name, // Usando o nome da milestone como o que é necessário
    dataNecessidade: format(new Date(m.start_date), 'dd/MM/yyyy'),
    deadline: format(addDays(new Date(m.start_date), -7), 'dd/MM/yyyy'), // Deadline 7 dias antes
    urgency: isBefore(addDays(new Date(m.start_date), -7), new Date())
  })) || [];

  return (
    <AppLayout title="Dashboard de Compras">
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
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Visão Geral de Suprimentos</h2>
          <Button onClick={() => window.location.href = '/obras/compras/novo'}>
            <ShoppingCart className="h-4 w-4 mr-2" />
            Novo Pedido
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Pedidos Abertos" value={openOrders.length} icon={ShoppingCart} color="text-blue-600" />
          <StatCard title="Aguardando Entrega" value={waitingDelivery.length} icon={Truck} color="text-orange-600" />
          <StatCard title="Economia (Saving)" value={formatCurrency(totalSaving)} icon={TrendingDown} color="text-emerald-600" />
          <StatCard title="Urgências" value={urgencyOrders} icon={AlertTriangle} color="text-red-600" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Custos por Obra */}
          <Card>
            <CardHeader>
              <CardTitle>Custos de Suprimentos por Obra</CardTitle>
              <CardDescription>Acumulado de pedidos de compra (Geral)</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
               {costsData.length > 0 ? (
                 <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={costsData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" width={100} fontSize={10} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={30}>
                        {costsData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#3b82f6' : '#94a3b8'} />
                        ))}
                      </Bar>
                    </BarChart>
                 </ResponsiveContainer>
               ) : (
                 <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                    Sem dados de custos
                 </div>
               )}
            </CardContent>
          </Card>

          {/* Últimas Entregas */}
          <Card>
            <CardHeader>
              <CardTitle>Status de Entregas</CardTitle>
              <CardDescription>Acompanhamento de logística</CardDescription>
            </CardHeader>
            <CardContent>
               <div className="space-y-4">
                  {waitingDelivery.slice(0, 5).map((o, idx) => (
                    <div key={o.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                       <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{o.description}</p>
                          <p className="text-[10px] text-muted-foreground">{o.project?.name || 'N/A'} | {formatCurrency(Number(o.net_amount))}</p>
                       </div>
                       <div className="text-right">
                          <Badge variant="outline" className={`text-[9px] mb-1 ${getStatusBadgeClass(o.status)}`}>
                             {getStatusLabel(o.status)}
                          </Badge>
                          <p className="text-[9px] text-slate-400">
                            Prev. {o.delivery_date_planned ? format(new Date(o.delivery_date_planned), 'dd/MM') : 'N/A'}
                          </p>
                       </div>
                    </div>
                  ))}
                  {waitingDelivery.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhuma entrega pendente</p>
                  )}
               </div>
            </CardContent>
          </Card>
        </div>

        {/* Planejamento de Compras (Lead Time) */}
        <Card>
          <CardHeader>
            <CardTitle>Necessidades Próximos 15 dias</CardTitle>
            <CardDescription>Materiais vinculados a milestones de engenharia</CardDescription>
          </CardHeader>
          <CardContent>
             <div className="overflow-x-auto">
                <table className="w-full">
                   <thead>
                      <tr className="text-left text-[10px] uppercase font-bold text-slate-500 border-b">
                        <th className="pb-3 px-2">Obra</th>
                        <th className="pb-3 px-2">Material / Etapa</th>
                        <th className="pb-3 px-2 text-right">Data Necessidade</th>
                        <th className="pb-3 px-2 text-right">Deadline Compra</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y text-xs">
                      {nextNeeds.map((need, idx) => (
                        <tr key={idx}>
                          <td className="py-3 px-2 font-medium">{need.obra}</td>
                          <td className="py-3 px-2">{need.material}</td>
                          <td className="py-3 px-2 text-right">{need.dataNecessidade}</td>
                          <td className={`py-3 px-2 text-right font-bold ${need.urgency ? 'text-red-600' : 'text-orange-600'}`}>
                            {need.urgency ? 'URGENTE' : need.deadline}
                          </td>
                        </tr>
                      ))}
                      {nextNeeds.length === 0 && (
                        <tr>
                          <td colSpan={4} className="text-sm text-muted-foreground text-center py-8">Nenhuma necessidade imediata identificada</td>
                        </tr>
                      )}
                   </tbody>
                </table>
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

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: 'Pendente',
    approved: 'Aprovado',
    ordered: 'Pedido Realizado',
    partially_delivered: 'Parcial',
    delivered: 'Entregue',
    cancelled: 'Cancelado'
  };
  return labels[status] || status;
}

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'delivered': return 'bg-emerald-50 text-emerald-700';
    case 'partially_delivered': return 'bg-amber-50 text-amber-700';
    case 'ordered': return 'bg-blue-50 text-blue-700';
    default: return 'bg-slate-50 text-slate-600';
  }
}
