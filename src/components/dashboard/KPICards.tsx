import { 
  Users, 
  Target, 
  CheckCircle2, 
  Clock,
  DollarSign,
  TrendingUp,
  TrendingDown,
  CalendarCheck,
  Building2,
  Eye,
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

interface KPIData {
  totalLeads: number;
  conversionRate: number;
  closedLeads: number;
  avgResponseTime: string;
  totalSalesValue: number;
  pendingCommissions: number;
  leadsTrend: number;
  conversionTrend: number;
  closedTrend: number;
  // Financial data
  totalReceivables?: number;
  totalPayables?: number;
  overdueReceivables?: number;
  overduePayables?: number;
  paidCommissions?: number;
  scheduledVisits?: number;
  propertyCount?: number;
  siteVisits?: number;
}

interface KPICardsProps {
  data: KPIData;
  isLoading?: boolean;
  periodLabel?: string;
  scheduledVisits?: number;
  propertyCount?: number;
  siteVisits?: number;
}

interface KPICardItemProps {
  title: string;
  value: string | number;
  trend?: number;
  icon: LucideIcon;
  tooltip: string;
  format?: 'number' | 'currency' | 'percent' | 'time';
  accentColor?: string;
}

function formatValue(value: string | number, format: string): string {
  if (typeof value === 'string') return value;
  
  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        notation: 'standard',
        maximumFractionDigits: 0,
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
}: KPICardItemProps & { isHighlighted?: boolean }) {
  const hasTrend = trend !== undefined && trend !== 0;
  const isPositive = (trend ?? 0) >= 0;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card className={cn(
            "card-hover cursor-default overflow-hidden",
            isHighlighted && "bg-gradient-to-r from-chart-5/10 to-chart-5/5 border-chart-5/30"
          )}>
            <CardContent className={cn("p-4", isHighlighted && "py-5")}>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <p className={cn(
                    "text-muted-foreground font-medium uppercase tracking-wider",
                    isHighlighted ? "text-xs sm:text-sm" : "text-[10px] sm:text-xs"
                  )}>
                    {title}
                  </p>
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

                <div className="flex flex-col">
                  <p className={cn(
                    "font-bold leading-tight break-words",
                    isHighlighted ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl"
                  )}>
                    {formatValue(value, format)}
                  </p>
                  
                  {hasTrend && (
                    <div className="flex items-center gap-1 mt-1">
                      {isPositive ? (
                        <TrendingUp className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-destructive" />
                      )}
                      <span className={cn(
                        "text-[10px] sm:text-xs font-semibold",
                        isPositive ? "text-emerald-500" : "text-destructive"
                      )}>
                        {trend > 0 ? '+' : ''}{trend}%
                      </span>
                    </div>
                  )}
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

export function KPICards({ data, isLoading, periodLabel = 'Últimos 30 dias', scheduledVisits, propertyCount, siteVisits }: KPICardsProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <KPICardSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <KPICardSkeleton key={i + 4} />
          ))}
        </div>
      </div>
    );
  }

  const kpis: KPICardItemProps[] = [
    {
      title: 'Leads',
      value: data.totalLeads,
      trend: data.leadsTrend,
      icon: Users,
      tooltip: `Total de leads captados - ${periodLabel}`,
      format: 'number',
      accentColor: 'primary',
    },
    {
      title: 'Conversão',
      value: data.conversionRate,
      trend: data.conversionTrend,
      icon: Target,
      tooltip: 'Taxa de conversão (ganhos/total)',
      format: 'percent',
      accentColor: 'chart-2',
    },
    {
      title: 'Ganhos',
      value: data.closedLeads,
      trend: data.closedTrend,
      icon: CheckCircle2,
      tooltip: `Leads convertidos em vendas - ${periodLabel}`,
      format: 'number',
      accentColor: 'chart-3',
    },
    {
      title: '1º Contato',
      value: data.avgResponseTime,
      icon: Clock,
      tooltip: 'Tempo medio ate a primeira ligacao ou mensagem',
      format: 'time',
      accentColor: 'chart-4',
    },
    {
      title: 'Visitas',
      value: scheduledVisits ?? 0,
      icon: CalendarCheck,
      tooltip: `Visitas agendadas - ${periodLabel}`,
      format: 'number',
      accentColor: 'chart-1',
    },
    {
      title: 'Imóveis',
      value: propertyCount ?? 0,
      icon: Building2,
      tooltip: 'Total de imóveis cadastrados',
      format: 'number',
      accentColor: 'chart-1',
    },
    {
      title: 'Site',
      value: siteVisits ?? 0,
      icon: Eye,
      tooltip: `Visitas ao site no período - ${periodLabel}`,
      format: 'number',
      accentColor: 'chart-2',
    },
  ];

  const salesKpi: KPICardItemProps = {
    title: 'Vendas (VGV)',
    value: data.totalSalesValue,
    icon: DollarSign,
    tooltip: `Valor total em vendas (VGV) - ${periodLabel}`,
    format: 'currency',
    accentColor: 'chart-5',
  };

  return (
    <div className="space-y-3">
      {/* Mobile: Grid de 2 colunas para manter legibilidade */}
      <div className="grid grid-cols-2 gap-2">
        {kpis.map((kpi) => (
          <KPICardItem key={kpi.title} {...kpi} />
        ))}
      </div>
      <KPICardItem {...salesKpi} isHighlighted />
    </div>
  );
}
