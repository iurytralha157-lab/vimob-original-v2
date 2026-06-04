import { AppLayout } from '@/components/layout/AppLayout';
import { PremiumFinancialCard } from '@/components/financial/PremiumFinancialCard';
import { useFinancialDashboard } from '@/hooks/use-financial';
import { useTelecomFinancialDashboard } from '@/hooks/use-telecom-financial-dashboard';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, exportToExcel } from '@/lib/export-financial';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Clock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Users,
  UserX,
  UserMinus,
  RefreshCw,
  Target,
  FileText,
  Award,
  Download
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Legend, Area, AreaChart, ComposedChart, Line } from 'recharts';

export default function FinancialDashboard() {
  const { organization } = useAuth();
  const isTelecom = organization?.segment === 'telecom';
  
  // Use different hooks based on segment
  const realEstateData = useFinancialDashboard();
  const telecomData = useTelecomFinancialDashboard();
  
  const isLoading = isTelecom ? telecomData.isLoading : realEstateData.isLoading;

  if (isLoading) {
    return (
      <AppLayout title="Dashboard Financeiro">
        <div className="space-y-4 md:space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 md:h-32" />)}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (isTelecom) {
    return <TelecomFinancialDashboard data={telecomData.data} />;
  }

  return <RealEstateFinancialDashboard data={realEstateData.data} />;
}

// ============= TELECOM FINANCIAL DASHBOARD =============
function TelecomFinancialDashboard({ data }: { data: ReturnType<typeof useTelecomFinancialDashboard>['data'] }) {
  const chartConfig = {
    receitas: { label: 'Receitas', color: 'hsl(var(--success))' },
    despesas: { label: 'Despesas', color: 'hsl(var(--destructive))' },
    mrr: { label: 'MRR', color: 'hsl(var(--primary))' },
  };

  const totalOverdue = (data?.overdueReceivables || 0) + (data?.overduePayables || 0);

  // Customer status pie chart data
  const customerStatusData = [
    { name: 'Ativos', value: data?.activeCustomers || 0, fill: 'hsl(var(--success))' },
    { name: 'Novos', value: data?.newCustomers || 0, fill: 'hsl(var(--primary))' },
    { name: 'Aguardando', value: data?.pendingCustomers || 0, fill: 'hsl(var(--warning))' },
    { name: 'Cancelados', value: data?.canceledCustomers || 0, fill: 'hsl(var(--destructive))' },
    { name: 'Suspensos', value: data?.suspendedCustomers || 0, fill: 'hsl(var(--muted-foreground))' },
    { name: 'Inadimplentes', value: data?.defaultingCustomers || 0, fill: '#ef4444' },
  ].filter(d => d.value > 0);

  return (
    <AppLayout title="Dashboard Financeiro">
      <div className="space-y-4 md:space-y-6">
        <p className="text-sm md:text-base text-muted-foreground">Visão geral das finanças - Telecom</p>

        {/* MRR Highlight */}
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Receita Mensal Recorrente (MRR)</p>
                <p className="text-2xl md:text-4xl font-bold text-primary">{formatCurrency(data?.mrr || 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Baseado em {data?.activeCustomers || 0} clientes instalados
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Projeção Anual</p>
                <p className="text-xl md:text-2xl font-bold">{formatCurrency(data?.annualProjection || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI Cards Row 1 - A Receber */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:gap-4 lg:grid-cols-4">
          <PremiumFinancialCard
            title="A Receber (30d)"
            value={formatCurrency(data?.receivable30 || 0)}
            description="Projeção MRR"
            icon={TrendingUp}
            variant="success"
            chartData={data?.monthlyData?.map(m => ({ value: m.receitas }))}
          />
          <PremiumFinancialCard
            title="A Receber (60d)"
            value={formatCurrency(data?.receivable60 || 0)}
            description="2x MRR"
            icon={Calendar}
          />
          <PremiumFinancialCard
            title="A Receber (90d)"
            value={formatCurrency(data?.receivable90 || 0)}
            description="3x MRR"
            icon={Calendar}
          />
          <PremiumFinancialCard
            title="A Pagar"
            value={formatCurrency(data?.totalPayable || 0)}
            icon={TrendingDown}
            variant="warning"
          />
        </div>

        {/* KPI Cards Row 2 - Comissões e Vencidos */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:gap-4 lg:grid-cols-4">
          <PremiumFinancialCard
            title="Comissões Pend."
            value={formatCurrency(data?.pendingCommissions || 0)}
            icon={DollarSign}
          />
          <PremiumFinancialCard
            title="Comissões Prev."
            value={formatCurrency(data?.forecastCommissions || 0)}
            icon={Clock}
          />
          <PremiumFinancialCard
            title="Comissões Pagas"
            value={formatCurrency(data?.paidCommissions || 0)}
            icon={CheckCircle2}
            variant="success"
          />
          <PremiumFinancialCard
            title="Vencidos"
            value={formatCurrency(totalOverdue)}
            icon={AlertTriangle}
            variant="destructive"
          />
        </div>

        {/* KPI Cards Row 3 - Risco e Churn */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:gap-4 lg:grid-cols-4">
          <PremiumFinancialCard
            title="Inadimplentes"
            value={`${data?.defaultingCustomers || 0} clientes`}
            description={formatCurrency(data?.defaultingValue || 0)}
            icon={UserMinus}
            variant="destructive"
          />
          <PremiumFinancialCard
            title="Cancelados"
            value={`${data?.canceledCustomers || 0} clientes`}
            description={formatCurrency(data?.churnValue || 0)}
            icon={UserX}
            variant="destructive"
          />
          <PremiumFinancialCard
            title="Suspensos"
            value={`${data?.suspendedCustomers || 0} clientes`}
            icon={Clock}
            variant="warning"
          />
          <PremiumFinancialCard
            title="Aguardando"
            value={`${data?.pendingCustomers || 0} clientes`}
            description="Aguardando + Em Análise"
            icon={RefreshCw}
          />
        </div>

        {/* Fluxo de Caixa Mensal */}
        <Card>
          <CardHeader className="p-3 sm:p-4 md:p-6 pb-2 md:pb-4">
            <CardTitle className="text-sm sm:text-base md:text-lg">Fluxo de Caixa Mensal</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Receitas vs Despesas (últimos 6 meses)</CardDescription>
          </CardHeader>
            <CardContent className="p-2 sm:p-4 md:p-6 pt-0 overflow-hidden">
            {data?.monthlyData && data.monthlyData.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-[200px] sm:h-[280px] md:h-[350px] w-full">
                <ComposedChart data={data.monthlyData}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} tick={{ fontSize: 9 }} width={35} />
                  <ChartTooltip 
                    content={<ChartTooltipContent />} 
                    formatter={(value) => formatCurrency(value as number)}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="receitas" name="Receitas" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesas" name="Despesas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="mrr" name="MRR Base" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: 'hsl(var(--primary))' }} />
                </ComposedChart>
              </ChartContainer>
            ) : (
              <div className="h-[200px] sm:h-[280px] md:h-[350px] flex items-center justify-center text-muted-foreground text-sm">
                Nenhum dado disponível
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
          {/* Customer Status Distribution */}
          <Card>
            <CardHeader className="p-3 sm:p-4 md:p-6 pb-2 md:pb-4">
              <CardTitle className="text-sm sm:text-base md:text-lg">Distribuição de Clientes</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Por status atual</CardDescription>
            </CardHeader>
            <CardContent className="p-2 sm:p-4 md:p-6 pt-0 overflow-hidden">
              {customerStatusData.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-[180px] sm:h-[250px] md:h-[300px] w-full">
                  <PieChart>
                    <Pie
                      data={customerStatusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={typeof window !== 'undefined' && window.innerWidth < 640 ? 50 : window.innerWidth < 768 ? 70 : 100}
                      label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {customerStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                  </PieChart>
                </ChartContainer>
              ) : (
                <div className="h-[180px] sm:h-[250px] md:h-[300px] flex items-center justify-center text-muted-foreground text-sm">
                  Nenhum dado disponível
                </div>
              )}
            </CardContent>
          </Card>

          {/* Resumo de Valores */}
          <Card>
            <CardHeader className="p-3 sm:p-4 md:p-6 pb-2 md:pb-4">
              <CardTitle className="text-sm sm:text-base md:text-lg">Resumo Financeiro</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Valores pendentes e projeções</CardDescription>
            </CardHeader>
            <CardContent className="p-2 sm:p-4 md:p-6 pt-0 overflow-hidden">
              <ChartContainer config={chartConfig} className="h-[180px] sm:h-[250px] md:h-[300px] w-full">
                <BarChart data={[
                  { name: 'MRR', value: data?.mrr || 0, fill: 'hsl(var(--primary))' },
                  { name: 'A Pagar', value: data?.totalPayable || 0, fill: 'hsl(var(--warning))' },
                  { name: 'Vencidos', value: totalOverdue, fill: 'hsl(var(--destructive))' },
                  { name: 'Comissões', value: data?.pendingCommissions || 0, fill: 'hsl(var(--muted-foreground))' },
                ]}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} tick={{ fontSize: 9 }} width={35} />
                  <ChartTooltip 
                    content={<ChartTooltipContent />} 
                    formatter={(value) => formatCurrency(value as number)}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
          <Card>
            <CardHeader className="p-3 sm:p-4 md:p-6 pb-2 md:pb-4">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Valores em Risco
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 md:p-6 pt-0">
              <div className="space-y-2 sm:space-y-3">
                <div className="flex justify-between items-center p-2 sm:p-3 bg-destructive/5 rounded-lg">
                  <div className="flex items-center gap-2">
                    <UserMinus className="h-4 w-4 text-destructive" />
                    <span className="text-xs sm:text-sm">Inadimplentes ({data?.defaultingCustomers || 0})</span>
                  </div>
                  <span className="font-bold text-destructive text-xs sm:text-sm md:text-base">{formatCurrency(data?.defaultingValue || 0)}/mês</span>
                </div>
                <div className="flex justify-between items-center p-2 sm:p-3 bg-destructive/5 rounded-lg">
                  <div className="flex items-center gap-2">
                    <UserX className="h-4 w-4 text-destructive" />
                    <span className="text-xs sm:text-sm">Cancelados ({data?.canceledCustomers || 0})</span>
                  </div>
                  <span className="font-bold text-destructive text-xs sm:text-sm md:text-base">{formatCurrency(data?.churnValue || 0)}/mês perdido</span>
                </div>
                <div className="flex justify-between items-center p-2 sm:p-3 bg-warning/10 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-warning" />
                    <span className="text-xs sm:text-sm">Suspensos ({data?.suspendedCustomers || 0})</span>
                  </div>
                  <Badge variant="outline" className="text-warning">Em espera</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-3 sm:p-4 md:p-6 pb-2 md:pb-4">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg">
                <DollarSign className="h-4 w-4 text-primary" />
                Resumo de Comissões
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 md:p-6 pt-0">
              <div className="space-y-2 sm:space-y-3">
                <div className="flex justify-between items-center p-2 sm:p-3 bg-muted/50 rounded-lg">
                  <span className="text-xs sm:text-sm">Pendentes</span>
                  <span className="font-bold text-xs sm:text-sm md:text-base">{formatCurrency(data?.pendingCommissions || 0)}</span>
                </div>
                <div className="flex justify-between items-center p-2 sm:p-3 bg-muted/50 rounded-lg">
                  <span className="text-xs sm:text-sm">Previstas</span>
                  <span className="font-bold text-xs sm:text-sm md:text-base">{formatCurrency(data?.forecastCommissions || 0)}</span>
                </div>
                <div className="flex justify-between items-center p-2 sm:p-3 bg-success/10 rounded-lg">
                  <span className="text-xs sm:text-sm">Pagas</span>
                  <span className="font-bold text-success text-xs sm:text-sm md:text-base">{formatCurrency(data?.paidCommissions || 0)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

// ============= REAL ESTATE FINANCIAL DASHBOARD (Original) =============
function RealEstateFinancialDashboard({ data }: { data: ReturnType<typeof useFinancialDashboard>['data'] }) {
  const pieData = [
    { name: 'Receitas', value: data?.receivable30 || 0, fill: 'hsl(var(--chart-1))' },
    { name: 'Despesas', value: data?.totalPayable || 0, fill: 'hsl(var(--chart-2))' },
  ].filter(d => d.value > 0);

  const chartConfig = {
    receitas: { label: 'Receitas', color: 'hsl(var(--success))' },
    despesas: { label: 'Despesas', color: 'hsl(var(--destructive))' },
  };
  
  const totalOverdue = (data?.overdueReceivables || 0) + (data?.overduePayables || 0);
  
  // Commission status data for pie chart
  const commissionPieData = [
    { name: 'Previstas', value: data?.forecastCommissions || 0, fill: 'hsl(var(--muted-foreground))' },
    { name: 'Pendentes', value: data?.pendingCommissions || 0, fill: 'hsl(var(--warning))' },
    { name: 'Pagas', value: data?.paidCommissions || 0, fill: 'hsl(var(--success))' },
  ].filter(d => d.value > 0);

  const handleExport = () => {
    if (!data) return;
    const exportData = [
      { Métrica: 'VGV Bruto', Valor: formatCurrency(data.vgvBruto) },
      { Métrica: 'VGV Líquido', Valor: formatCurrency(data.vgvLiquido) },
      { Métrica: 'Ticket Médio', Valor: formatCurrency(data.avgTicket) },
      { Métrica: 'Receita Confirmada (30d)', Valor: formatCurrency(data.confirmedRevenue30) },
      { Métrica: 'A Receber (30d)', Valor: formatCurrency(data.receivable30) },
      { Métrica: 'A Pagar', Valor: formatCurrency(data.totalPayable) },
      { Métrica: 'Vencidos', Valor: formatCurrency(totalOverdue) },
      { Métrica: 'Comissões Previstas', Valor: formatCurrency(data.forecastCommissions) },
      { Métrica: 'Comissões Liberadas', Valor: formatCurrency(data.pendingCommissions) },
      { Métrica: 'Comissões Pagas', Valor: formatCurrency(data.paidCommissions) },
      { Métrica: 'Projeção Anual', Valor: formatCurrency(data.annualProjection) },
    ];
    exportToExcel(exportData, `Dashboard_Financeiro_${format(new Date(), 'yyyy-MM-dd')}`);
    toast.success('Resumo financeiro exportado com sucesso!');
  };

  return (
    <AppLayout title="Dashboard Financeiro">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Performance Financeira</h2>
            <p className="text-sm text-muted-foreground text-balance">Métricas consolidadas de vendas e recebimentos.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="hidden md:flex gap-2"
              onClick={handleExport}
            >
              <Download className="h-4 w-4" />
              Exportar
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="hidden md:flex gap-2"
              onClick={() => window.location.href = '/financeiro/dre'}
            >
              <FileText className="h-4 w-4" />
              Ver DRE Executivo
            </Button>
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 px-3 py-1 text-xs font-bold">
              ESTRATÉGICO
            </Badge>
          </div>
        </div>

        {/* KPIs Grid */}
        <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4">
          <PremiumFinancialCard
            title="VGV Bruto"
            value={formatCurrency(data?.vgvBruto || 0)}
            description={`${data?.activeContracts || 0} contratos ativos`}
            icon={Award}
            variant="primary"
            chartData={data?.monthlyData?.map(m => ({ value: m.receitas }))}
          />
          <PremiumFinancialCard
            title="VGV Líquido"
            value={formatCurrency(data?.vgvLiquido || 0)}
            description="Líquido de comissões"
            icon={Target}
            variant="success"
          />
          <PremiumFinancialCard
            title="Ticket Médio"
            value={formatCurrency(data?.avgTicket || 0)}
            description="Média por contrato"
            icon={FileText}
          />
          <PremiumFinancialCard
            title="Receita Confirmada (30d)"
            value={formatCurrency(data?.confirmedRevenue30 || 0)}
            description="Entradas pagas nos últimos 30 dias"
            icon={TrendingUp}
            variant="success"
            chartData={data?.monthlyData?.map(m => ({ value: m.receitas }))}
          />
          <PremiumFinancialCard
            title="A Receber (30d)"
            value={formatCurrency(data?.receivable30 || 0)}
            description="Entradas previstas"
            icon={Calendar}
          />
          <PremiumFinancialCard
            title="A Pagar"
            value={formatCurrency(data?.totalPayable || 0)}
            description="Despesas em aberto"
            icon={TrendingDown}
            variant="warning"
          />
          <PremiumFinancialCard
            title="Vencidos"
            value={formatCurrency((data?.overdueReceivables || 0) + (data?.overduePayables || 0))}
            description="Atrasados"
            icon={AlertTriangle}
            variant="destructive"
          />
          <PremiumFinancialCard
            title="Taxa de Inadimplência"
            value={`${(data?.defaultRate || 0).toFixed(1)}%`}
            description="Vencidos / total previsto"
            icon={AlertTriangle}
            variant="destructive"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Evolução do Fluxo de Caixa</CardTitle>
              <CardDescription>Receitas Realizadas vs Despesas (6 meses)</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {data?.monthlyData && data.monthlyData.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-[300px] w-full">
                  <AreaChart data={data.monthlyData}>
                    <defs>
                      <linearGradient id="colorReceitas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorDespesas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `R$ ${v/1000}k`} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area type="monotone" dataKey="receitas" stroke="hsl(var(--success))" fillOpacity={1} fill="url(#colorReceitas)" strokeWidth={3} />
                    <Area type="monotone" dataKey="despesas" stroke="hsl(var(--destructive))" fillOpacity={1} fill="url(#colorDespesas)" strokeWidth={2} strokeDasharray="5 5" />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center">Sem dados históricos</div>
              )}
            </CardContent>
          </Card>

          {/* Side Info - Commissions & Progress */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  Resumo de Comissões
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg border">
                  <span className="text-sm font-medium">Previstas</span>
                  <span className="font-bold">{formatCurrency(data?.forecastCommissions || 0)}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-primary/5 rounded-lg border border-primary/10">
                  <span className="text-sm font-medium text-primary">Liberadas</span>
                  <span className="font-bold text-primary">{formatCurrency(data?.pendingCommissions || 0)}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-success/5 rounded-lg border border-success/10">
                  <span className="text-sm font-medium text-success">Pagas</span>
                  <span className="font-bold text-success">{formatCurrency(data?.paidCommissions || 0)}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-6">
                <p className="text-sm font-semibold text-primary mb-2">Previsão Anual (Forecast)</p>
                <h3 className="text-3xl font-bold">{formatCurrency(data?.annualProjection || 0)}</h3>
                <p className="text-xs text-muted-foreground mt-2">Baseado no volume de recebimentos recorrentes atuais.</p>
                <Button className="w-full mt-6">Ver Relatório Detalhado</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
