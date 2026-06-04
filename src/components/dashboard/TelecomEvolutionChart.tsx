import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { DashboardChartTooltip } from './DashboardChartTooltip';
import { TelecomEvolutionPoint } from '@/hooks/use-telecom-dashboard-stats';

interface TelecomEvolutionChartProps {
  data: TelecomEvolutionPoint[];
  isLoading?: boolean;
}

const STATUS_CONFIG = {
  novos: { color: '#3B82F6', label: 'Novos' },
  instalados: { color: '#22C55E', label: 'Instalados' },
  aguardando: { color: '#EAB308', label: 'Aguardando' },
  em_analise: { color: '#8B5CF6', label: 'Em Análise' },
  cancelado: { color: '#EF4444', label: 'Cancelados' },
  suspenso: { color: '#F97316', label: 'Suspensos' },
  inadimplente: { color: '#DC2626', label: 'Inadimplentes' },
} as const;

type StatusKey = keyof typeof STATUS_CONFIG;

function CustomTooltip(props: any) {
  const { payload } = props;
  const hasData = payload?.some((p: any) => (p.value ?? 0) > 0);
  if (!hasData) return null;

  return (
    <DashboardChartTooltip 
      {...props}
      payload={payload?.filter((entry: any) => (entry.value ?? 0) > 0)}
      nameFormatter={(name, entry) => {
        const key = entry.dataKey as StatusKey;
        return STATUS_CONFIG[key]?.label || name;
      }}
    />
  );
}

export function TelecomEvolutionChart({ data, isLoading }: TelecomEvolutionChartProps) {
  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Evolução de Clientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Evolução de Clientes
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-[280px]">
          <TrendingUp className="h-10 w-10 text-muted-foreground/20 mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum dado no período</p>
        </CardContent>
      </Card>
    );
  }

  // Calculate totals for legend
  const totals = data.reduce(
    (acc, item) => ({
      novos: acc.novos + item.novos,
      instalados: acc.instalados + item.instalados,
      aguardando: acc.aguardando + item.aguardando,
      em_analise: acc.em_analise + item.em_analise,
      cancelado: acc.cancelado + item.cancelado,
      suspenso: acc.suspenso + item.suspenso,
      inadimplente: acc.inadimplente + item.inadimplente,
    }),
    { novos: 0, instalados: 0, aguardando: 0, em_analise: 0, cancelado: 0, suspenso: 0, inadimplente: 0 }
  );

  const activeStatuses = (Object.keys(totals) as StatusKey[]).filter(
    (key) => totals[key] > 0
  );

  // Order for visual stacking (most important first)
  const statusOrder: StatusKey[] = ['instalados', 'novos', 'aguardando', 'em_analise', 'cancelado', 'suspenso', 'inadimplente'];
  const orderedActiveStatuses = statusOrder.filter(s => activeStatuses.includes(s));

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Evolução de Clientes
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        {/* Chart */}
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <linearGradient key={key} id={`gradient-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={config.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={config.color} stopOpacity={0.05} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke="hsl(var(--border))" 
                opacity={0.4}
                vertical={false}
              />
              <XAxis 
                dataKey="date" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                dy={8}
                interval="preserveStartEnd"
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                width={35}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              
              {orderedActiveStatuses.map((status) => (
                <Area
                  key={status}
                  type="monotone"
                  dataKey={status}
                  stroke={STATUS_CONFIG[status].color}
                  strokeWidth={2}
                  fill={`url(#gradient-${status})`}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Custom Legend */}
        <div className="flex justify-center gap-4 pt-4 border-t border-border/50 mt-3 flex-wrap">
          {orderedActiveStatuses.map((status) => (
            <div key={status} className="flex items-center gap-1.5">
              <div 
                className="w-2.5 h-2.5 rounded-full" 
                style={{ backgroundColor: STATUS_CONFIG[status].color }} 
              />
              <span className="text-[11px] text-muted-foreground">
                {STATUS_CONFIG[status].label}
              </span>
              <span className="text-[11px] font-semibold text-foreground">
                {totals[status]}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
