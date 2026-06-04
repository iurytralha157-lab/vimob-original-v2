import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Activity, AlertTriangle, Building2, CreditCard, Zap, type LucideIcon } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { FeedEvent } from '@/hooks/use-admin-dashboard';

const TYPE_META: Record<string, { icon: LucideIcon; label: string }> = {
  organization_created: { icon: Building2, label: 'Nova organização' },
  payment_received: { icon: CreditCard, label: 'Pagamento' },
  automation_failed: { icon: Zap, label: 'Automação' },
  trial_expired: { icon: AlertTriangle, label: 'Trial expirado' },
};

const severityTone: Record<FeedEvent['severity'], string> = {
  info: 'bg-sky-500/15 text-sky-500',
  success: 'bg-emerald-500/15 text-emerald-500',
  warning: 'bg-amber-500/15 text-amber-500',
  error: 'bg-rose-500/15 text-rose-500',
  critical: 'bg-rose-600/20 text-rose-500',
};

interface Props {
  events?: FeedEvent[];
  loading?: boolean;
}

export function OperationalFeed({ events = [], loading }: Props) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">Feed operacional</CardTitle>
            <p className="text-xs text-muted-foreground">Eventos da plataforma em tempo real</p>
          </div>
        </div>
        <Badge variant="outline" className="rounded-full font-normal">{events.length}</Badge>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[0,1,2,3,4].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-sm text-muted-foreground">
            <Activity className="h-8 w-8 mb-2 opacity-40" />
            Nenhum evento recente.
          </div>
        ) : (
          <div className="relative pl-4 space-y-3 max-h-[480px] overflow-y-auto">
            <div className="absolute left-[18px] top-1 bottom-1 w-px bg-border" />
            {events.map((e) => {
              const meta = TYPE_META[e.type] ?? { icon: Activity, label: e.type };
              const Icon = meta.icon;
              return (
                <div key={e.id} className="relative pl-6">
                  <div className={cn('absolute left-0 top-2 h-8 w-8 -translate-x-[10px] rounded-full ring-4 ring-card flex items-center justify-center', severityTone[e.severity])}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="rounded-xl border border-border/60 bg-card/50 px-3 py-2.5 hover:bg-muted/40 transition-colors">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-sm font-medium truncate">{e.title}</span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(parseISO(e.created_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                    {(e.description || e.organization_name) && (
                      <div className="text-xs text-muted-foreground truncate">
                        {e.organization_name && <span className="font-medium text-foreground/80">{e.organization_name}</span>}
                        {e.organization_name && e.description && ' · '}
                        {e.description}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
