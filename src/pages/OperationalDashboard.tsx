import { AppLayout } from "@/components/layout/AppLayout";
import { useOperationalRequests } from "@/hooks/use-operational";
import { useEnterpriseKPIs } from "@/hooks/use-enterprise-kpis";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from "@/components/ui/card";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { 
  Badge 
} from "@/components/ui/badge";
import { 
  Loader2, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  HardHat,
  Wallet,
  Compass,
  ShoppingCart,
  User,
  TrendingUp,
  BarChart3,
  Calendar
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from 'recharts';

export default function OperationalDashboard() {
  const { data: requests, isLoading: isLoadingRequests } = useOperationalRequests();
  const { data: kpis, isLoading: isLoadingKPIs } = useEnterpriseKPIs();

  const stats = {
    pending: requests?.filter(r => r.status === 'pending').length || 0,
    in_analysis: requests?.filter(r => r.status === 'in_analysis').length || 0,
    approved: requests?.filter(r => r.status === 'approved').length || 0,
    active_projects: kpis?.engineering?.total_active || 0,
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'finance': return <Wallet className="h-4 w-4 text-emerald-500" />;
      case 'architecture': return <Compass className="h-4 w-4 text-blue-500" />;
      case 'engineering': return <HardHat className="h-4 w-4 text-orange-500" />;
      case 'purchase': return <ShoppingCart className="h-4 w-4 text-purple-500" />;
      default: return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pendente</Badge>;
      case 'in_analysis': return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Em Análise</Badge>;
      case 'approved': return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Aprovado</Badge>;
      case 'rejected': return <Badge variant="destructive">Rejeitado</Badge>;
      case 'completed': return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">Concluído</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <AppLayout title="ERP Operacional - Plenos Obras">
      <div className="space-y-6">
        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="hover:shadow-md transition-all">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Solicitações Pendentes</p>
                  <h3 className="text-2xl font-bold">{stats.pending}</h3>
                </div>
                <div className="h-10 w-10 bg-amber-100 rounded-full flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-all">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Obras Ativas</p>
                  <h3 className="text-2xl font-bold text-orange-600">{stats.active_projects}</h3>
                </div>
                <div className="h-10 w-10 bg-orange-100 rounded-full flex items-center justify-center">
                  <HardHat className="h-5 w-5 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-all">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">EBITDA Mensal</p>
                  <h3 className="text-2xl font-bold text-emerald-600">
                    {formatCurrency(kpis?.financial?.ebitda || 0)}
                  </h3>
                </div>
                <div className="h-10 w-10 bg-emerald-100 rounded-full flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-all">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">ROI Geral</p>
                  <h3 className="text-2xl font-bold text-blue-600">
                    {((kpis?.financial?.roi_overview || 0) * 100).toFixed(1)}%
                  </h3>
                </div>
                <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Operational Flow Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full md:w-auto grid-cols-3 md:grid-cols-6 h-auto p-1 bg-muted/50">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="engineering" className="gap-2">
              <HardHat className="h-4 w-4" /> Engenharia
            </TabsTrigger>
            <TabsTrigger value="finance" className="gap-2">
              <Wallet className="h-4 w-4" /> Financeiro
            </TabsTrigger>
            <TabsTrigger value="architecture" className="gap-2">
              <Compass className="h-4 w-4" /> Arquitetura
            </TabsTrigger>
            <TabsTrigger value="purchase" className="gap-2">
              <ShoppingCart className="h-4 w-4" /> Compras
            </TabsTrigger>
            <TabsTrigger value="requests">Filas</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Resumo Financeiro Realtime */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Fluxo de Caixa Operacional</CardTitle>
                  <CardDescription>Receitas vs Despesas (Consolidado)</CardDescription>
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
                      <YAxis tickFormatter={(value) => `R$${(value / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Bar dataKey="valor" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Status das Obras */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Progresso das Obras</CardTitle>
                  <CardDescription>Evolução física média: {kpis?.engineering?.avg_progress?.toFixed(1) || 0}%</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {kpis?.engineering?.projects?.slice(0, 4).map((project: any) => (
                    <div key={project.id} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{project.name}</span>
                        <span className="text-muted-foreground">{project.progress || 0}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className="bg-orange-500 h-2 rounded-full transition-all duration-1000" 
                          style={{ width: `${project.progress || 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {(!kpis?.engineering?.projects || kpis.engineering.projects.length === 0) && (
                    <div className="text-center py-8 text-muted-foreground">
                      Nenhuma obra em andamento.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="engineering" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               {/* KPIs de Engenharia */}
               <Card className="col-span-1">
                <CardHeader>
                  <CardTitle className="text-sm">Obras a Iniciar</CardTitle>
                </CardHeader>
                <CardContent>
                   <h4 className="text-2xl font-bold">0</h4>
                   <p className="text-xs text-muted-foreground">Próximos 30 dias</p>
                </CardContent>
               </Card>
               <Card className="col-span-1">
                <CardHeader>
                  <CardTitle className="text-sm">SLA de Milestones</CardTitle>
                </CardHeader>
                <CardContent>
                   <h4 className="text-2xl font-bold text-emerald-600">98%</h4>
                   <p className="text-xs text-muted-foreground text-emerald-600">No prazo</p>
                </CardContent>
               </Card>
               <Card className="col-span-1">
                <CardHeader>
                  <CardTitle className="text-sm">Projetos Complementares</CardTitle>
                </CardHeader>
                <CardContent>
                   <h4 className="text-2xl font-bold text-blue-600">12</h4>
                   <p className="text-xs text-muted-foreground">Aguardando aprovação</p>
                </CardContent>
               </Card>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle>Cronograma de Obras (Gantt Simplificado)</CardTitle>
                <CardDescription>Timeline operacional das obras ativas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                   {kpis?.engineering?.projects?.map((project: any) => (
                     <div key={project.id} className="flex items-center gap-4">
                        <div className="w-32 shrink-0 text-sm font-medium truncate">{project.name}</div>
                        <div className="flex-1 bg-muted/30 rounded-lg h-8 relative overflow-hidden">
                           <div 
                             className="absolute top-0 bottom-0 left-0 bg-orange-500/20 border-r-2 border-orange-500 flex items-center px-2 text-[10px] font-bold text-orange-700"
                             style={{ width: `${project.progress || 10}%` }}
                           >
                             {project.progress || 0}%
                           </div>
                        </div>
                        <div className="w-24 shrink-0 text-xs text-muted-foreground flex items-center gap-1">
                           <Calendar className="h-3 w-3" />
                           {project.end_date_planned ? format(new Date(project.end_date_planned), 'dd/MM/yy') : '--'}
                        </div>
                     </div>
                   ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requests" className="mt-6">
            <div className="grid grid-cols-1 gap-4">
              {isLoadingRequests ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : requests?.length === 0 ? (
                <Card className="border-dashed py-12 text-center">
                  <p className="text-muted-foreground">Nenhuma solicitação operacional encontrada.</p>
                </Card>
              ) : (
                requests?.map(request => (
                  <RequestCard key={request.id} request={request} getIcon={getIcon} getStatusBadge={getStatusBadge} />
                ))
              )}
            </div>
          </TabsContent>
          
          {['finance', 'architecture', 'engineering', 'purchase'].map(tab => (
            <TabsContent key={tab} value={tab} className="mt-6">
               <div className="grid grid-cols-1 gap-4">
                {requests?.filter(r => r.type === tab).map(request => (
                  <RequestCard key={request.id} request={request} getIcon={getIcon} getStatusBadge={getStatusBadge} />
                ))}
                {requests?.filter(r => r.type === tab).length === 0 && (
                   <Card className="border-dashed py-12 text-center">
                    <p className="text-muted-foreground">Nenhuma solicitação de {tab} pendente.</p>
                  </Card>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppLayout>
  );
}

function RequestCard({ request, getIcon, getStatusBadge }: any) {
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer">
      <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-4">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 bg-muted/30`}>
          {getIcon(request.type)}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold truncate">{request.title}</h4>
            {getStatusBadge(request.status)}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {request.lead && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" /> Lead: <span className="text-foreground font-medium">{request.lead.name}</span>
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> Criado em: {format(new Date(request.created_at), "dd MMM HH:mm", { locale: ptBR })}
            </span>
            {request.due_date && (
              <span className="flex items-center gap-1 text-red-500 font-medium">
                <AlertCircle className="h-3 w-3" /> SLA: {format(new Date(request.due_date), "dd/MM")}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 md:ml-auto">
          <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider">
            {request.priority}
          </Badge>
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center overflow-hidden border">
            {request.assignee?.avatar_url ? (
              <img src={request.assignee.avatar_url} alt={request.assignee.name} className="h-full w-full object-cover" />
            ) : (
              <User className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
