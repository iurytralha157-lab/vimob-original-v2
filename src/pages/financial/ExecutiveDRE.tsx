import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  FileSpreadsheet,
  Loader2,
  Building2,
  FileBarChart,
  HelpCircle,
} from 'lucide-react';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useDREExecutive } from '@/hooks/use-dre-executive';
import { useProperties } from '@/hooks/use-properties';
import { FinancialEmptyState } from '@/components/financial/FinancialEmptyState';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { exportToExcel } from '@/lib/export-financial';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

export default function ExecutiveDRE() {
  const navigate = useNavigate();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));

  const { data: properties } = useProperties();

  const [year, month] = selectedMonth.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  const startDate = startOfMonth(date);
  const endDate = endOfMonth(date);

  const { data: dreData, isLoading: dreLoading } = useDREExecutive({
    startDate,
    endDate,
    regime: 'cash',
    compareWithPrevious: true,
    projectId: selectedPropertyId === 'all' ? undefined : selectedPropertyId,
  });

  const handleExportExcel = async () => {
    if (!dreData) return;

    const exportData = dreData.lines.map((line) => ({
      Descrição: line.name,
      'Valor Atual': line.value,
      'Valor Anterior': line.previousValue || 0,
      'Variação %': line.variation?.toFixed(2) || '0.00',
    }));

    await exportToExcel(exportData, `DRE_Executivo_${selectedMonth}`);
    toast.success('DRE exportado com sucesso!');
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val);

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return {
      value: format(d, 'yyyy-MM'),
      label: format(d, 'MMMM yyyy', { locale: ptBR }),
    };
  });

  const hasData = !!dreData && dreData.lines.length > 0;

  return (
    <AppLayout title="DRE Executivo">
      <div className="space-y-6">
        {/* Header com Filtros */}
        <Card>
          <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Mês de Referência
                </Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="h-9 w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Filtrar por Imóvel
                </Label>
                <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                  <SelectTrigger className="h-9 w-[260px]">
                    <Building2 className="mr-2 h-3.5 w-3.5 text-primary" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Imóveis</SelectItem>
                    {properties?.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title || p.code || p.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={!hasData} className="h-9">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Exportar Excel
            </Button>
          </CardContent>
        </Card>

        {dreLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : hasData ? (
          <TooltipProvider>
            <div className="space-y-6">
              {/* Cards de Resumo Executivo */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <SummaryCard
                  title="EBITDA"
                  value={dreData.totals.ebitda}
                  subValue="Resultado Operacional"
                  trend={dreData.totals.ebitda >= 0 ? 'up' : 'down'}
                  tooltip="Earnings Before Interest, Taxes, Depreciation, and Amortization. Representa quanto a empresa gera de caixa apenas com seus ativos operacionais."
                />
                <SummaryCard 
                  title="Receita" 
                  value={dreData.totals.grossRevenue} 
                  subValue="Vendas e Recebimentos" 
                  tooltip="Total de entradas brutas no período selecionado."
                />
                <SummaryCard
                  title="Custo Variável"
                  value={dreData.totals.variableCosts}
                  subValue="Comissões e Custos Diretos"
                  variant="negative"
                  tooltip="Custos que variam proporcionalmente ao volume de vendas (ex: comissões, impostos sobre nota)."
                />
                <SummaryCard
                  title="Custo Fixo"
                  value={dreData.totals.fixedCosts}
                  subValue="Despesas Administrativas"
                  variant="negative"
                  tooltip="Custos recorrentes que não dependem do volume de vendas (ex: aluguel, salários fixos, softwares)."
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <SummaryCard 
                  title="Receita Líquida" 
                  value={dreData.totals.netRevenue} 
                  subValue="Após Deduções/Impostos" 
                  tooltip="Receita bruta menos as deduções diretas e impostos sobre venda."
                />
                <SummaryCard 
                  title="Lucro Bruto" 
                  value={dreData.totals.grossProfit} 
                  subValue="Margem de Contribuição" 
                  tooltip="Receita Líquida menos os Custos Variáveis."
                />
                <SummaryCard
                  title="Resultado"
                  value={dreData.totals.netResult}
                  subValue="Lucro/Prejuízo Líquido"
                  variant={dreData.totals.netResult >= 0 ? 'positive' : 'negative'}
                  tooltip="Resultado final após todos os custos e despesas."
                />
                <SummaryCard
                  title="ROI Geral"
                  value={dreData.totals.roi * 100}
                  isPercent
                  subValue="Retorno sobre Investimento"
                  variant="info"
                  tooltip="Retorno sobre o capital investido na operação."
                />
              </div>

              {/* Gráfico de Composição */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-lg">Fluxo de Resultados</CardTitle>
                    <CardDescription>Composição de Receita vs Custos no período</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dreData.lines}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <YAxis hide />
                        <RechartsTooltip
                          formatter={(val: number) => formatCurrency(val)}
                          contentStyle={{
                            backgroundColor: 'hsl(var(--popover))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: 12,
                            color: 'hsl(var(--popover-foreground))',
                          }}
                        />
                        <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={50}>
                          {dreData.lines.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={
                                entry.type === 'revenue'
                                  ? 'hsl(142 76% 45%)'
                                  : entry.type === 'expense'
                                    ? 'hsl(0 84% 60%)'
                                    : 'hsl(var(--primary))'
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Margem Líquida</CardTitle>
                    <CardDescription>Performance relativa</CardDescription>
                  </CardHeader>
                  <CardContent className="flex h-[300px] flex-col items-center justify-center space-y-6">
                    <div className="relative flex h-40 w-40 items-center justify-center rounded-full border-8 border-border">
                      <div className="text-center">
                        <p className="text-3xl font-black text-primary">
                          {((dreData.totals.netResult / (dreData.totals.grossRevenue || 1)) * 100).toFixed(1)}%
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Margem Líquida
                        </p>
                      </div>
                    </div>
                    <div className="w-full space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Ponto de Equilíbrio</span>
                        <span className="font-bold text-foreground">
                          {dreData.totals.netResult >= 0 ? 'Atingido' : 'Não Atingido'}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full ${dreData.totals.netResult >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                          style={{
                            width: `${Math.min(100, Math.abs((dreData.totals.netResult / (dreData.totals.grossRevenue || 1)) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Tabela Detalhada */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Demonstrativo Detalhado</CardTitle>
                    <CardDescription>Valores comparativos com o mês anterior</CardDescription>
                  </div>
                  <Badge variant="secondary">Regime de Caixa</Badge>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          <th className="px-2 pb-3">Descrição</th>
                          <th className="px-2 pb-3 text-right">Valor Atual</th>
                          <th className="px-2 pb-3 text-right">Valor Anterior</th>
                          <th className="px-2 pb-3 text-right">Variação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {dreData.lines.map((line) => (
                          <tr
                            key={line.id}
                            className={`transition-colors hover:bg-muted/40 ${line.isTotal ? 'bg-muted/30 font-bold' : ''}`}
                          >
                            <td className="px-2 py-3 text-sm text-foreground">{line.name}</td>
                            <td
                              className={`px-2 py-3 text-right text-sm tabular-nums ${
                                line.type === 'expense'
                                  ? 'text-red-400'
                                  : line.type === 'revenue'
                                    ? 'text-emerald-400'
                                    : 'text-foreground'
                              }`}
                            >
                              {formatCurrency(line.value)}
                            </td>
                            <td className="px-2 py-3 text-right text-sm tabular-nums text-muted-foreground">
                              {line.previousValue ? formatCurrency(line.previousValue) : '-'}
                            </td>
                            <td className="px-2 py-3 text-right text-sm">
                              <div className="flex items-center justify-end gap-1">
                                {line.variation && line.variation > 0 ? (
                                  <ArrowUpRight className="h-3 w-3 text-emerald-400" />
                                ) : line.variation && line.variation < 0 ? (
                                  <ArrowDownRight className="h-3 w-3 text-red-400" />
                                ) : null}
                                <span
                                  className={
                                    line.variation && line.variation > 0
                                      ? 'text-emerald-400'
                                      : line.variation && line.variation < 0
                                        ? 'text-red-400'
                                        : 'text-muted-foreground'
                                  }
                                >
                                  {line.variation ? `${line.variation.toFixed(1)}%` : '-'}
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TooltipProvider>
        ) : (
          <FinancialEmptyState
            title="Sem dados no período"
            description="Não encontramos lançamentos para este filtro. Tente ajustar o período ou o imóvel selecionado."
            actionLabel="Ir para Lançamentos"
            onAction={() => navigate('/financeiro/lancamentos')}
            icon={FileBarChart}
          />
        )}
      </div>
    </AppLayout>
  );
}

function SummaryCard({
  title,
  value,
  subValue,
  trend,
  isPercent = false,
  variant = 'default',
  tooltip,
}: {
  title: string;
  value: number;
  subValue: string;
  trend?: 'up' | 'down';
  isPercent?: boolean;
  variant?: 'default' | 'positive' | 'negative' | 'info';
  tooltip?: string;
}) {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(val);

  const getColors = () => {
    switch (variant) {
      case 'negative':
        return 'text-red-400';
      case 'positive':
        return 'text-emerald-400';
      case 'info':
        return 'text-primary';
      default:
        return 'text-foreground';
    }
  };

  return (
    <Card className="transition-all hover:border-primary/40">
      <CardContent className="p-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{title}</p>
            {tooltip && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[200px]">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {trend === 'up' && <TrendingUp className="h-4 w-4 text-emerald-400" />}
          {trend === 'down' && <ArrowDownRight className="h-4 w-4 text-red-400" />}
        </div>
        <h3 className={`text-2xl font-black ${getColors()}`}>
          {isPercent ? `${value.toFixed(1)}%` : formatCurrency(value)}
        </h3>
        <p className="mt-1 text-[11px] italic text-muted-foreground">{subValue}</p>
      </CardContent>
    </Card>
  );
}
