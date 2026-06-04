import { ArrowDownRight, ArrowUpRight, LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface KpiCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  deltaPct?: number;
  accent?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  loading?: boolean;
}

const accentStyles: Record<NonNullable<KpiCardProps['accent']>, string> = {
  default: 'bg-card',
  primary: 'bg-gradient-to-br from-primary/10 via-card to-card border-primary/20',
  success: 'bg-gradient-to-br from-emerald-500/10 via-card to-card border-emerald-500/20',
  warning: 'bg-gradient-to-br from-amber-500/10 via-card to-card border-amber-500/20',
  danger: 'bg-gradient-to-br from-rose-500/10 via-card to-card border-rose-500/20',
};

export function KpiCard({ label, value, hint, icon: Icon, deltaPct, accent = 'default', loading }: KpiCardProps) {
  const positive = (deltaPct ?? 0) >= 0;
  return (
    <Card className={cn('rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5', accentStyles[accent])}>
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <div className={cn(
          'h-9 w-9 rounded-xl flex items-center justify-center',
          accent === 'primary' ? 'bg-primary/15 text-primary' :
          accent === 'success' ? 'bg-emerald-500/15 text-emerald-500' :
          accent === 'warning' ? 'bg-amber-500/15 text-amber-500' :
          accent === 'danger' ? 'bg-rose-500/15 text-rose-500' :
          'bg-muted text-muted-foreground'
        )}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-8 w-28" />
        ) : (
          <div className="text-2xl md:text-3xl font-semibold tracking-tight">{value}</div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {deltaPct !== undefined && !loading && (
          <span className={cn(
            'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium',
            positive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
          )}>
            {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(deltaPct).toFixed(1)}%
          </span>
        )}
        {hint && <span className="text-muted-foreground truncate">{hint}</span>}
      </div>
    </Card>
  );
}
