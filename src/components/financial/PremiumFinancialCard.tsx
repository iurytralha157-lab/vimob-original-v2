
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LucideIcon, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

interface PremiumFinancialCardProps {
  title: string;
  value: string;
  description?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'primary';
  chartData?: { value: number }[];
  className?: string;
}

export function PremiumFinancialCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  variant = 'default',
  chartData,
  className,
}: PremiumFinancialCardProps) {
  const variantStyles = {
    default: 'bg-card border-border',
    success: 'bg-card border-success/20',
    warning: 'bg-card border-warning/20',
    destructive: 'bg-card border-destructive/20',
    primary: 'bg-primary/5 border-primary/20',
  };

  const iconStyles = {
    default: 'bg-muted text-muted-foreground',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    destructive: 'bg-destructive/10 text-destructive',
    primary: 'bg-primary/10 text-primary',
  };

  return (
    <Card className={cn('overflow-hidden border transition-all hover:shadow-md', variantStyles[variant], className)}>
      <CardContent className="p-0">
        <div className="p-4 md:p-6 pb-2">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
              <h3 className="text-xl md:text-2xl font-bold tracking-tight">{value}</h3>
              {description && (
                <p className="text-[10px] sm:text-xs text-muted-foreground">{description}</p>
              )}
            </div>
            <div className={cn("p-2 rounded-xl", iconStyles[variant])}>
              <Icon className="h-5 w-5" />
            </div>
          </div>

          {trend && (
            <div className="mt-4 flex items-center gap-1.5">
              <div className={cn(
                "flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                trend.isPositive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
              )}>
                {trend.isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(trend.value)}%
              </div>
              <span className="text-[10px] text-muted-foreground">vs mês anterior</span>
            </div>
          )}
        </div>

        {chartData && (
          <div className="h-12 w-full mt-2 opacity-50">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id={`gradient-${title}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={variant === 'success' ? '#10b981' : variant === 'destructive' ? '#ef4444' : '#3b82f6'} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={variant === 'success' ? '#10b981' : variant === 'destructive' ? '#ef4444' : '#3b82f6'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={variant === 'success' ? '#10b981' : variant === 'destructive' ? '#ef4444' : '#3b82f6'}
                  strokeWidth={2}
                  fill={`url(#gradient-${title})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
