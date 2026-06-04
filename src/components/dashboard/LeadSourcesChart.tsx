import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart as PieChartIcon, TrendingUp, Users, MousePointer2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { cn } from '@/lib/utils';
import { DashboardChartTooltip } from './DashboardChartTooltip';
import { sourceLabels } from '@/hooks/use-dashboard-filters';

interface SourceDataPoint {
  name: string;
  value: number;
  rawSource?: string;
}

interface LeadSourcesChartProps {
  data: SourceDataPoint[];
  isLoading?: boolean;
  selectedSource?: string | null;
  onSourceChange?: (source: string | null) => void;
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(263, 70%, 50%)',
  'hsl(217, 91%, 60%)',
  'hsl(160, 84%, 39%)',
  'hsl(38, 92%, 50%)',
  'hsl(350, 89%, 60%)',
  'hsl(187, 92%, 42%)',
];

function ChartSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center h-full space-y-6 py-4">
      <div className="relative h-48 w-48 flex items-center justify-center">
        <Skeleton className="h-full w-full rounded-full" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Skeleton className="h-16 w-16 rounded-full bg-background/50" />
        </div>
      </div>
      <div className="space-y-2 flex flex-col items-center">
        <Skeleton className="h-3 w-20 rounded" />
        <Skeleton className="h-8 w-12 rounded" />
      </div>
    </div>
  );
}

function CustomTooltip(props: any) {
  return (
    <DashboardChartTooltip 
      {...props}
      className="min-w-[180px]"
      valueFormatter={(value, entry) => {
        const percentage = entry?.payload?.percentage;
        return `${value} (${percentage}%)`;
      }}
    />
  );
}

export function LeadSourcesChart({ data, isLoading, selectedSource, onSourceChange }: LeadSourcesChartProps) {
  if (isLoading) {
    return (
      <Card className="overflow-hidden h-full flex flex-col shadow-sm border-border/50">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
            <PieChartIcon className="h-4 w-4 text-primary" />
            Origem dos Leads
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 p-4">
          <ChartSkeleton />
        </CardContent>
      </Card>
    );
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const chartData = data
    .map(item => ({
      ...item,
      percentage: total > 0 ? Math.round((item.value / total) * 100) : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const bestSource = chartData[0] || { name: 'N/A', value: 0, percentage: 0 };

  const handleSourceClick = (entry: any) => {
    if (!onSourceChange) return;
    
    const clickedSource = entry.rawSource;
    const clickedLabel = entry.name;
    const currentSelectedLabel = selectedSource ? (sourceLabels[selectedSource] || selectedSource) : null;
    
    if (clickedLabel === currentSelectedLabel) {
      onSourceChange(null);
    } else {
      onSourceChange(clickedSource);
    }
  };

  if (total === 0) {
    return (
      <Card className="overflow-hidden h-full flex flex-col shadow-sm border-border/50">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
            <PieChartIcon className="h-4 w-4 text-primary" />
            Origem dos Leads
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center p-8 text-center">
          <div className="space-y-2">
            <div className="bg-muted rounded-full w-12 h-12 flex items-center justify-center mx-auto opacity-50">
              <PieChartIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm font-medium">Nenhum dado de origem disponível para este período</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden h-full flex flex-col shadow-sm border-border/50">
      <CardHeader className="pb-0 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold flex items-center gap-2 uppercase tracking-widest text-muted-foreground">
            <PieChartIcon className="h-3.5 w-3.5 text-primary" />
            Origem dos Leads
          </CardTitle>
          {selectedSource && (
            <button 
              onClick={() => onSourceChange?.(null)}
              className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
            >
              <MousePointer2 className="h-2.5 w-2.5" />
              Limpar Filtro
            </button>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 p-4 pt-2 flex flex-col items-center justify-center">
        {/* Donut Chart Container */}
        <div className="w-full aspect-square max-w-[280px] relative mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="95%"
                paddingAngle={3}
                dataKey="value"
                animationBegin={0}
                animationDuration={1200}
                stroke="transparent"
                strokeWidth={0}
                className="outline-none"
              >
                {chartData.map((entry, index) => {
                  const isSelected = selectedSource ? (sourceLabels[selectedSource] || selectedSource) === entry.name : false;
                  const hasSelection = !!selectedSource;
                  
                  return (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                      opacity={hasSelection && !isSelected ? 0.35 : 1}
                      stroke={isSelected ? "white" : "transparent"}
                      strokeWidth={isSelected ? 2 : 0}
                      className={cn(
                        "transition-all duration-300 hover:opacity-90 origin-center outline-none cursor-pointer",
                        isSelected && "drop-shadow-md scale-[1.02]"
                      )}
                      onClick={() => handleSourceClick(entry)}
                    />
                  );
                })}
              </Pie>
              <Tooltip 
                content={<CustomTooltip />} 
                cursor={false}
                wrapperStyle={{ zIndex: 1001 }}
              />
            </PieChart>
          </ResponsiveContainer>
          
          {/* Central text for Donut - Improved Hierarchy */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none z-0">
            <span className="text-[10px] sm:text-[11px] uppercase font-bold text-muted-foreground/70 tracking-[0.2em] mb-0.5">
              Leads
            </span>
            <div className="relative">
              <span className="text-4xl sm:text-5xl font-black text-foreground tracking-tighter tabular-nums drop-shadow-sm">
                {total}
              </span>
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-1 bg-primary/20 rounded-full blur-[2px]" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
