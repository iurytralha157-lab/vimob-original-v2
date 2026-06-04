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

interface ChartDataPoint {
  name: string;
  meta: number;
  site: number;
  wordpress: number;
}

interface LeadEvolutionChartProps {
  data: ChartDataPoint[];
  isLoading?: boolean;
}

function ChartSkeleton() {
  return (
    <div className="h-[180px] sm:h-[200px] flex items-end gap-2 px-4 pb-4">
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton 
          key={i} 
          className="flex-1" 
          style={{ height: `${30 + Math.random() * 60}%` }}
        />
      ))}
    </div>
  );
}

export function LeadEvolutionChart({ data, isLoading }: LeadEvolutionChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-chart-3" />
            Evolução de Leads
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-chart-3" />
            Evolução de Leads
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[180px] sm:h-[200px] flex items-center justify-center text-muted-foreground text-sm">
            Nenhum dado disponível
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-chart-3" />
          Evolução de Leads
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[180px] sm:h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorMeta" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorSite" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke="hsl(var(--border))" 
                vertical={false}
              />
              <XAxis 
                dataKey="name" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<DashboardChartTooltip />} />
              <Area 
                type="monotone" 
                dataKey="meta" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorMeta)"
                name="Meta Ads"
              />
              <Area 
                type="monotone" 
                dataKey="site" 
                stroke="hsl(var(--chart-2))" 
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorSite)"
                name="Site"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-primary" />
            <span className="text-[10px] sm:text-xs text-muted-foreground">Meta Ads</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-2))' }} />
            <span className="text-[10px] sm:text-xs text-muted-foreground">Site</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
