import { 
  Users, 
  Target, 
  CheckCircle2, 
  DollarSign,
  TrendingUp,
  TrendingDown,
  LucideIcon
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TelecomKPIData {
  totalCustomers: number;
  activeCustomers: number;
  conversionRate: number;
  monthlyRecurringRevenue: number;
  customersTrend: number;
  activeTrend: number;
  conversionTrend: number;
}

interface TelecomKPICardsProps {
  data: TelecomKPIData;
  isLoading?: boolean;
  periodLabel?: string;
}

interface KPICardItemProps {
  title: string;
  value: string | number;
  trend?: number;
  icon: LucideIcon;
  tooltip: string;
  format?: 'number' | 'currency' | 'percent';
  accentColor?: string;
  isHighlighted?: boolean;
}

function formatValue(value: string | number, format: string): string {
  if (typeof value === 'string') return value;
  
  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        notation: value >= 100000 ? 'compact' : 'standard',
        maximumFractionDigits: value >= 100000 ? 1 : 0,
      }).format(value);
    case 'percent':
      return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;
    case 'number':
    default:
      return value.toLocaleString('pt-BR');
  }
}

function KPICardItem({ 
  title, 
  value, 
  trend, 
  icon: Icon, 
  tooltip,
  format = 'number',
  accentColor = 'primary',
  isHighlighted = false,
}: KPICardItemProps) {
  const hasTrend = trend !== undefined && trend !== 0;
  const isPositive = (trend ?? 0) >= 0;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card className={cn(
            "card-hover cursor-default",
            isHighlighted && "bg-gradient-to-r from-chart-5/10 to-chart-5/5 border-chart-5/30"
          )}>
            <CardContent className={cn("p-4", isHighlighted && "py-5")}>
              <div className="flex items-center gap-3 justify-between">
                <div className="min-w-0 flex-1">
                  <p className={cn(
                    "text-muted-foreground",
                    isHighlighted ? "text-xs sm:text-sm" : "text-[10px] sm:text-xs"
                  )}>
                    {title}
                  </p>
                  <p className={cn(
                    "font-bold mt-0.5",
                    isHighlighted ? "text-xl sm:text-3xl" : "text-lg sm:text-2xl"
                  )}>
                    {formatValue(value, format)}
                  </p>
                  {hasTrend && (
                    <div className="flex items-center gap-0.5 mt-1">
                      {isPositive ? (
                        <TrendingUp className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-destructive" />
                      )}
                      <span className={cn(
                        "text-[10px] sm:text-xs font-medium",
                        isPositive ? "text-emerald-500" : "text-destructive"
                      )}>
                        {trend > 0 ? '+' : ''}{trend}%
                      </span>
                    </div>
                  )}
                </div>
                <div className={cn(
                  "rounded-lg flex items-center justify-center flex-shrink-0",
                  isHighlighted ? "h-10 w-10 sm:h-12 sm:w-12" : "h-8 w-8 sm:h-9 sm:w-9"
                )} style={{ backgroundColor: `hsl(var(--${accentColor}) / 0.1)` }}>
                  <Icon 
                    className={cn(
                      isHighlighted ? "h-5 w-5 sm:h-6 sm:w-6" : "h-4 w-4 sm:h-5 sm:w-5"
                    )} 
                    style={{ color: `hsl(var(--${accentColor}))` }} 
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function KPICardSkeleton() {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-12" />
            <Skeleton className="h-3 w-10" />
          </div>
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}

export function TelecomKPICards({ data, isLoading, periodLabel = 'Últimos 30 dias' }: TelecomKPICardsProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <KPICardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  const kpis: KPICardItemProps[] = [
    {
      title: 'Clientes',
      value: data.totalCustomers,
      trend: data.customersTrend,
      icon: Users,
      tooltip: `Total de clientes cadastrados - ${periodLabel}`,
      format: 'number',
      accentColor: 'primary',
    },
    {
      title: 'Conversão',
      value: data.conversionRate,
      trend: data.conversionTrend,
      icon: Target,
      tooltip: 'Taxa de conversão (instalados/total)',
      format: 'percent',
      accentColor: 'chart-2',
    },
    {
      title: 'Ativos',
      value: data.activeCustomers,
      trend: data.activeTrend,
      icon: CheckCircle2,
      tooltip: `Clientes com status Instalado - ${periodLabel}`,
      format: 'number',
      accentColor: 'chart-3',
    },
  ];

  const mrrKpi: KPICardItemProps = {
    title: 'Receita Mensal',
    value: data.monthlyRecurringRevenue,
    icon: DollarSign,
    tooltip: `Soma dos planos de clientes ativos (instalados) - ${periodLabel}`,
    format: 'currency',
    accentColor: 'chart-5',
  };

  return (
    <div className="space-y-3 lg:space-y-0">
      {/* Desktop: 4 colunas */}
      <div className="hidden lg:grid lg:grid-cols-4 gap-3">
        {kpis.map((kpi) => (
          <KPICardItem key={kpi.title} {...kpi} />
        ))}
        <KPICardItem {...mrrKpi} />
      </div>
      
      {/* Mobile: 2 colunas + MRR destacado */}
      <div className="lg:hidden space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {kpis.map((kpi) => (
            <KPICardItem key={kpi.title} {...kpi} />
          ))}
        </div>
        <KPICardItem {...mrrKpi} isHighlighted />
      </div>
    </div>
  );
}
