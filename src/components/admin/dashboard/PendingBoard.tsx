import { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface PendingBoardProps {
  title: string;
  icon: LucideIcon;
  tone?: 'default' | 'danger' | 'warning' | 'success';
  count?: number;
  loading?: boolean;
  empty?: string;
  children?: ReactNode;
}

const toneIconBg: Record<NonNullable<PendingBoardProps['tone']>, string> = {
  default: 'bg-muted text-muted-foreground',
  danger: 'bg-rose-500/15 text-rose-500',
  warning: 'bg-amber-500/15 text-amber-500',
  success: 'bg-emerald-500/15 text-emerald-500',
};

export function PendingBoard({ title, icon: Icon, tone = 'default', count, loading, empty = 'Nada por aqui.', children }: PendingBoardProps) {
  return (
    <Card className="rounded-2xl flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-3">
          <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center', toneIconBg[tone])}>
            <Icon className="h-4 w-4" />
          </div>
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        </div>
        {count !== undefined && (
          <Badge variant="outline" className="rounded-full font-normal">{count}</Badge>
        )}
      </CardHeader>
      <CardContent className="pt-0 flex-1">
        {loading ? (
          <div className="space-y-2">
            {[0,1,2].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
          </div>
        ) : count === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">{empty}</div>
        ) : (
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

export function PendingRow({ title, subtitle, value, valueTone }: { title: string; subtitle?: string; value?: string; valueTone?: 'danger' | 'warning' | 'success' | 'default' }) {
  const toneClass = valueTone === 'danger' ? 'text-rose-500' : valueTone === 'warning' ? 'text-amber-500' : valueTone === 'success' ? 'text-emerald-500' : 'text-foreground';
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/50 px-3 py-2 hover:bg-muted/40 transition-colors">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground truncate">{subtitle}</div>}
      </div>
      {value && <div className={cn('text-sm font-semibold whitespace-nowrap', toneClass)}>{value}</div>}
    </div>
  );
}
