import {
  Activity,
  AlertCircle,
  Ban,
  Building2,
  CalendarDays,
  ExternalLink,
  MoreVertical,
  ShieldCheck,
  Target,
  Trash2,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { MouseEvent } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AdminOrganization } from '@/hooks/use-admin-organizations';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface OrganizationCardProps {
  org: AdminOrganization;
  onImpersonate: (id: string, name: string) => void;
  onViewDetails: (id: string) => void;
  onToggleStatus: (id: string, current: boolean) => void;
  onDelete: (id: string, name: string) => void;
}

export function OrganizationCard({
  org,
  onImpersonate,
  onViewDetails,
  onToggleStatus,
  onDelete,
}: OrganizationCardProps) {
  const status = getStatusConfig(org.subscription_status, org.is_active);
  const healthTone = getHealthTone(org.health_score);

  const stop = (event: MouseEvent) => event.stopPropagation();

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onViewDetails(org.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onViewDetails(org.id);
        }
      }}
      className="group cursor-pointer overflow-hidden border-border/60 bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
              {org.logo_url ? (
                <img src={org.logo_url} alt={org.name} className="h-full w-full object-cover" />
              ) : (
                <Building2 className="h-6 w-6 text-primary" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-semibold">{org.name}</h3>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Activity className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{org.segment || 'Geral'}</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-start gap-1.5">
            <div className="flex flex-col items-end gap-1">
              <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px] font-medium leading-none', status.color)}>
                {status.label}
              </Badge>
              {org.overdue_amount > 0 && (
                <Badge variant="outline" className="h-5 border-destructive/40 px-1.5 text-[10px] leading-none text-destructive">
                  Inadimplente
                </Badge>
              )}
            </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={stop}>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-lg">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56" onClick={stop}>
              <DropdownMenuItem onClick={() => onViewDetails(org.id)} className="cursor-pointer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Ver painel completo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onImpersonate(org.id, org.name)} className="cursor-pointer">
                <ShieldCheck className="mr-2 h-4 w-4 text-emerald-500" />
                Entrar na conta
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onToggleStatus(org.id, org.is_active)} className="cursor-pointer">
                {org.is_active ? (
                  <>
                    <Ban className="mr-2 h-4 w-4 text-amber-500" />
                    Desativar acesso
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4 text-emerald-500" />
                    Reativar acesso
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(org.id, org.name)} className="cursor-pointer text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir organização
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Metric icon={Users} label="Usuários" value={org.user_count} />
          <Metric icon={Target} label="Leads" value={org.lead_count} />
          <Metric icon={Zap} label="Automações" value={org.automation_count} />
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Saúde da operação</span>
              <span className={cn('font-semibold', healthTone.text)}>{org.health_score}%</span>
            </div>
            <Progress value={org.health_score} className="h-1.5" indicatorClassName={healthTone.bar} />
          </div>

          <div className="flex items-end justify-between gap-3 border-t pt-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Receita mensal</p>
              <p className="text-sm font-bold">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(org.mrr)}
              </p>
            </div>

            {org.overdue_amount > 0 ? (
              <div className="text-right">
                <p className="flex items-center justify-end gap-1 text-[10px] font-semibold uppercase text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  Em atraso
                </p>
                <p className="text-sm font-bold text-destructive">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(org.overdue_amount)}
                </p>
              </div>
            ) : (
              <div className="max-w-[45%] text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Último acesso</p>
                <p className="truncate text-xs font-medium">
                  {org.last_access_at
                    ? formatDistanceToNow(new Date(org.last_access_at), { addSuffix: true, locale: ptBR })
                    : 'Sem acesso'}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            Criada em {new Date(org.created_at).toLocaleDateString('pt-BR')}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-2 text-center">
      <Icon className="mx-auto mb-1 h-3.5 w-3.5 text-muted-foreground" />
      <p className="text-sm font-bold">{value}</p>
      <p className="truncate text-[10px] uppercase text-muted-foreground">{label}</p>
    </div>
  );
}

function getStatusConfig(status: string, isActive: boolean) {
  if (!isActive) return { label: 'Inativo', color: 'border-red-200 bg-red-100 text-red-700' };

  switch (status) {
    case 'active':
      return { label: 'Ativo', color: 'border-emerald-200 bg-emerald-100 text-emerald-700' };
    case 'trial':
      return { label: 'Trial', color: 'border-blue-200 bg-blue-100 text-blue-700' };
    case 'suspended':
      return { label: 'Suspenso', color: 'border-amber-200 bg-amber-100 text-amber-700' };
    default:
      return { label: status || 'Sem status', color: 'border-border bg-muted text-muted-foreground' };
  }
}

function getHealthTone(score: number) {
  if (score >= 80) return { text: 'text-emerald-500', bar: 'bg-emerald-500' };
  if (score >= 50) return { text: 'text-amber-500', bar: 'bg-amber-500' };
  return { text: 'text-destructive', bar: 'bg-destructive' };
}
