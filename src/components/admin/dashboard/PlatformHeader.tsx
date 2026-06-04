import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { DashboardPeriod } from '@/hooks/use-admin-dashboard';

interface PlatformHeaderProps {
  period: DashboardPeriod;
  onPeriodChange: (p: DashboardPeriod) => void;
  onRefresh: () => void;
  isFetching: boolean;
  lastUpdated?: Date;
  highlights: string[];
}

export function PlatformHeader({ period, onPeriodChange, onRefresh, isFetching, lastUpdated, highlights }: PlatformHeaderProps) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-2">
      <div className="space-y-2">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Visão Geral da Plataforma</h1>
        <div className="flex flex-wrap items-center gap-2">
          {highlights.length === 0 ? (
            <span className="text-sm text-muted-foreground">Tudo sob controle por aqui.</span>
          ) : (
            highlights.map((h, i) => (
              <Badge key={i} variant="outline" className="rounded-full bg-card border-border/60 text-xs font-normal text-muted-foreground">
                {h}
              </Badge>
            ))
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Select value={String(period)} onValueChange={(v) => onPeriodChange(Number(v) as DashboardPeriod)}>
          <SelectTrigger className="w-[140px] rounded-xl bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
            <SelectItem value="365">Últimos 12 meses</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={isFetching}
          className="rounded-xl bg-card"
          aria-label="Atualizar"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
        {lastUpdated && (
          <span className="hidden md:inline text-xs text-muted-foreground">
            Atualizado {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  );
}
