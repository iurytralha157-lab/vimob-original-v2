import { 
  Building2, 
  User, 
  Mail, 
  Phone, 
  Calendar, 
  Clock, 
  ChevronRight,
  Eye
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { OnboardingRequest } from '@/hooks/use-onboarding-requests';
import { cn } from '@/lib/utils';

interface OnboardingRequestCardProps {
  request: OnboardingRequest;
  onView: (request: OnboardingRequest) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendente', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  approved: { label: 'Aprovada', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Rejeitada', color: 'bg-red-100 text-red-700 border-red-200' },
};

export function OnboardingRequestCard({ request, onView }: OnboardingRequestCardProps) {
  const status = STATUS_CONFIG[request.status] || STATUS_CONFIG.pending;

  return (
    <Card 
      className="group hover:shadow-xl transition-all duration-300 border-border/50 overflow-hidden bg-card/50 backdrop-blur-sm cursor-pointer"
      onClick={() => onView(request)}
    >
      <CardContent className="p-0">
        <div className="p-5">
          <div className="flex justify-between items-start mb-4">
            <div className="flex gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden shrink-0 group-hover:scale-105 transition-transform">
                {request.logo_url ? (
                  <img src={request.logo_url} alt="" className="h-full w-full object-contain p-2" />
                ) : (
                  <Building2 className="h-6 w-6 text-primary" />
                )}
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-base text-foreground leading-none truncate max-w-[200px]">
                  {request.company_name}
                </h3>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(new Date(request.created_at), "dd 'de' MMM, HH:mm", { locale: ptBR })}
                </p>
              </div>
            </div>
            <Badge variant="outline" className={cn("text-[10px] px-1.5 h-5 font-bold uppercase tracking-wider", status.color)}>
              {status.label}
            </Badge>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/30 border border-border/50">
              <div className="h-8 w-8 rounded-full bg-background flex items-center justify-center border border-border/50">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">{request.responsible_name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{request.responsible_email}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px] uppercase font-bold tracking-tight text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="text-[9px] h-4 px-1">{request.segment || 'Geral'}</Badge>
              </div>
              <div className="flex items-center gap-1.5 justify-end">
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {request.responsible_phone ? 'Disponível' : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 bg-muted/20 border-t border-border/50 flex justify-between items-center group-hover:bg-primary/5 transition-colors">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" /> Clique para analisar
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
        </div>
      </CardContent>
    </Card>
  );
}
