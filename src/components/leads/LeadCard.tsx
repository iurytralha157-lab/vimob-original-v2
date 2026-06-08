import { useState, memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Phone, Mail, MessageCircle, Clock, CheckCircle, User, Zap, Trophy, XCircle, Loader2, GripVertical } from 'lucide-react';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { cn } from '@/lib/utils';
import { formatResponseTime } from '@/hooks/use-lead-timeline';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Draggable } from '@hello-pangea/dnd';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFloatingChat } from '@/contexts/FloatingChatContext';
import { formatPhoneForDisplay } from '@/lib/phone-utils';
import { SlaBadge } from './SlaBadge';
import { useRecordFirstResponseOnAction } from '@/hooks/use-first-response';
import { useCreateActivity } from '@/hooks/use-activities';
import { TaskOutcomeDialog, TaskOutcome } from '@/components/leads/TaskOutcomeDialog';
import { useAuth } from '@/contexts/AuthContext';
import { ReentryBadge } from '@/components/leads/ReentryBadge';

// Deal status labels and colors
const dealStatusConfig = {
  open: {
    label: 'Aberto',
    color: 'bg-muted text-muted-foreground',
    icon: null
  },
  won: {
    label: 'Ganho',
    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    icon: Trophy
  },
  lost: {
    label: 'Perdido',
    color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    icon: XCircle
  }
};
interface LeadCardProps {
  lead: any;
  onClick: () => void;
  index: number;
  onAssignNow: (leadId: string) => void;
  isDragDisabled: boolean;
  tourTarget?: string;
}

// Formata tempo sempre em horas (ex: "30min", "2h", "72h")
const formatShortTime = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHrs = Math.floor(diffMs / 3600000);
  if (diffHrs === 0) {
    const diffMins = Math.floor(diffMs / 60000);
    return `${diffMins}min`;
  }
  return `${diffHrs}h`;
};
export const LeadCard = memo(function LeadCard({
  lead,
  onClick,
  index,
  onAssignNow,
  isDragDisabled = false,
  tourTarget,
}: LeadCardProps) {
  const { openNewChat } = useFloatingChat();
  const { profile } = useAuth();
  const { recordFirstResponse } = useRecordFirstResponseOnAction();
  const createActivity = useCreateActivity();
  const [outcomeDialogOpen, setOutcomeDialogOpen] = useState(false);
  const [outcomeType, setOutcomeType] = useState<'call' | 'email'>('call');
  const stageTime = lead.stage_entered_at ? formatShortTime(new Date(lead.stage_entered_at)) : '-';
  const pendingTasks = lead.tasks_count?.pending || 0;
  const completedTasks = lead.tasks_count?.completed || 0;
  const totalTasks = pendingTasks + completedTasks;
  const hasPhone = !!lead.phone;
  const hasEmail = !!lead.email;
  const leadAvatarUrl = lead.whatsapp_avatar_url || lead.whatsapp_picture || lead.contact_picture || null;
  
  // Get interest value from: interest property, interest plan, legacy valor_interesse, or property
  const interestPropertyPrice = lead.interest_property?.preco;
  const interestPlanPrice = lead.interest_plan?.price;
  const valorInteresse = interestPropertyPrice || interestPlanPrice || lead.valor_interesse || lead.property?.preco;
  const interestLabel = lead.interest_property?.code || lead.interest_property?.title || 
                        lead.interest_plan?.code || lead.interest_plan?.name || 
                        lead.property?.code || lead.property?.title || null;

  // Verifica se o lead tem tags de prioridade alta
  const hasHighPriority = lead.tags?.some((tag: any) => tag.name.toLowerCase().includes('urgente') || tag.name.toLowerCase().includes('vip') || tag.name.toLowerCase().includes('prioridade') || tag.name.toLowerCase().includes('hot'));

  // Esquema de cores dinâmico baseado na prioridade
  const iconColors = hasHighPriority ? {
    phone: "bg-blue-200 text-blue-700 hover:bg-blue-300 dark:bg-blue-900 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-700",
    whatsapp: "bg-orange-200 text-orange-700 hover:bg-orange-300 dark:bg-orange-900 dark:text-orange-300 ring-1 ring-orange-300 dark:ring-orange-700",
    email: "bg-purple-200 text-purple-700 hover:bg-purple-300 dark:bg-purple-900 dark:text-purple-300 ring-1 ring-purple-300 dark:ring-purple-700"
  } : {
    phone: "bg-blue-100 text-blue-600 hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-400",
    whatsapp: "bg-orange-100 text-orange-600 hover:bg-orange-200 dark:bg-orange-950 dark:text-orange-400",
    email: "bg-purple-100 text-purple-600 hover:bg-purple-200 dark:bg-purple-950 dark:text-purple-400"
  };
  const formatCurrency = (value: number) => {
    if (value >= 1_000_000) {
      const v = value / 1_000_000;
      const formatted = v.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: v % 1 === 0 ? 0 : 1 });
      return `R$${formatted}M`;
    } else if (value >= 1_000) {
      const v = value / 1_000;
      const formatted = v.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
      return `R$${formatted}K`;
    }
    return `R$${value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
  };
  const handlePhoneClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (lead.phone) {
      recordFirstResponse({
        leadId: lead.id,
        organizationId: lead.organization_id || profile.organization_id || '',
        channel: 'phone',
        actorUserId: profile.id || null,
        firstResponseAt: lead.first_response_at,
      });
      window.open(`tel:${lead.phone.replace(/\D/g, '')}`, '_blank');
      setOutcomeType('call');
      setOutcomeDialogOpen(true);
    }
  };
  const handleWhatsAppClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (lead.phone) {
      openNewChat(lead.phone, lead.name, lead.id);
    }
  };
  const handleEmailClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (lead.email) {
      const gmailUrl = `https://mail.google.com/mail/view=cm&fs=1&tf=1&to=${encodeURIComponent(lead.email)}`;
      window.open(gmailUrl, '_blank');
      setOutcomeType('email');
      setOutcomeDialogOpen(true);
    }
  };

  const handleOutcomeConfirm = (outcome: TaskOutcome, notes: string) => {
    createActivity.mutate({
      lead_id: lead.id,
      type: outcomeType === 'call' ? 'call' : 'email',
      content: outcomeType === 'call' ? 'Tentativa de ligação' : 'Email enviado',
      metadata: { outcome, notes, channel: outcomeType },
    });
    setOutcomeDialogOpen(false);
  };
  const isLost = lead.deal_status === 'lost';
  const isWon = lead.deal_status === 'won';
  
  // Verificar se o lead foi criado há menos de 10 segundos (aguardando atribuição via round-robin)
  const isRecentlyCreated = lead.created_at && 
    !lead.assigned_user_id &&
    (Date.now() - new Date(lead.created_at).getTime()) < 10000;
  
  return <>
    <Draggable draggableId={lead.id} index={index} isDragDisabled={isDragDisabled}>
      {(provided, snapshot) => <div data-tour={tourTarget} ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className={cn("bg-card border-border rounded-lg p-3 transition-all duration-200 group hover:shadow-lg hover:shadow-primary/10 hover:border-primary/30 hover:-translate-y-0.5 border-0 relative", isDragDisabled ? "cursor-default" : "cursor-pointer", snapshot.isDragging && "shadow-xl rotate-1 scale-[1.02] border-primary", isLost && "bg-destructive/5 border-destructive/30 hover:bg-destructive/10", isWon && "bg-emerald-500/5 border-emerald-500/30")} onClick={onClick}>
          {/* Deal Status Badge + Tags */}
          <div className="flex items-center gap-1 mb-2 flex-wrap">
            {/* Deal Status Badge */}
            {lead.deal_status && lead.deal_status !== 'open' && <span className={cn("text-[9px] px-1.5 py-0.5 font-medium flex items-center gap-0.5 rounded-full", dealStatusConfig[lead.deal_status as keyof typeof dealStatusConfig].color)}>
                {dealStatusConfig[lead.deal_status as keyof typeof dealStatusConfig].icon && (() => {
            const Icon = dealStatusConfig[lead.deal_status as keyof typeof dealStatusConfig].icon;
            return Icon ? <Icon className="h-2.5 w-2.5" /> : null;
          })()}
                {dealStatusConfig[lead.deal_status as keyof typeof dealStatusConfig].label}
              </span>}
            
            {/* Tags - primeira tag em destaque */}
            {lead.tags && lead.tags.length > 0 ? (
                <>
                  <span className="text-[9px] px-1.5 py-0.5 font-medium rounded-full border" style={{
                    backgroundColor: lead.tags[0].color || '#6b7280',
                    color: '#FFFFFF',
                    borderColor: lead.tags[0].color || '#6b7280'
                  }}>
                    {lead.tags[0].name}
                  </span>
                  {lead.tags.length > 1 && <span className="text-[10px] text-muted-foreground">+{lead.tags.length - 1}</span>}
                </>
              ) : null}
          </div>



          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="relative shrink-0">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={leadAvatarUrl || undefined} alt={lead.name} />
                  <AvatarFallback className="bg-muted text-muted-foreground text-xs font-medium">
                    {lead.name?.[0]?.toUpperCase() || <User className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
                {/* Indicador de mensagens não lidas */}
                {lead.unread_count > 0 && <span className="absolute -top-1 -right-1 h-4 min-w-4 flex items-center justify-center px-1 text-[9px] font-bold bg-primary text-primary-foreground rounded-full ring-2 ring-card">
                    {lead.unread_count > 9 ? '9+' : lead.unread_count}
                  </span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h4 className="font-semibold text-sm truncate text-foreground">{lead.name}</h4>
                  <ReentryBadge count={lead.reentry_count} lastEntryAt={lead.last_entry_at} />
                </div>
                {lead.phone && <p className="text-[11px] text-muted-foreground truncate">{formatPhoneForDisplay(lead.phone)}</p>}
              </div>
            </div>
            
            {/* Arraste agora habilitado no card inteiro via dragHandleProps acima */}
          </div>

          {/* Source indicator: Meta campaign, Google campaign, or Website property */}
          {(() => {
            const meta = lead.lead_meta?.[0];
            const platform = meta?.platform?.toLowerCase();
            const source = lead.source?.toLowerCase();
            const campaignName = meta?.campaign_name;
            const interestProp = lead.interest_property;

            // Meta campaign
            if (platform === 'meta' || platform === 'facebook' || source === 'meta' || source === 'facebook') {
              if (!campaignName) return null;
              return (
                <div className="flex items-center gap-1.5 -mt-1 mb-1 min-w-0">
                  <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="#1877F2">
                    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.018 1.793-4.684 4.533-4.684 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.93-1.956 1.886v2.273h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                  </svg>
                  <span className="text-[10px] text-muted-foreground/80 truncate leading-none">{campaignName}</span>
                </div>
              );
            }

            // Google campaign
            if (platform === 'google' || source === 'google') {
              if (!campaignName) return null;
              return (
                <div className="flex items-center gap-1.5 -mt-1 mb-1 min-w-0">
                  <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span className="text-[10px] text-muted-foreground/80 truncate leading-none">{campaignName}</span>
                </div>
              );
            }

            // Website / property interest
            if ((source === 'site' || source === 'website') && interestProp) {
              const label = interestProp.code 
                ?
                 `${interestProp.code} · ${(interestProp.title || '').substring(0, 20)}${(interestProp.title || '').length > 20 ? '…' : ''}`
                : (interestProp.title || '').substring(0, 30);
              return (
                <div className="flex items-center gap-1.5 -mt-1 mb-1 min-w-0">
                  <svg className="h-3 w-3 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                  <span className="text-[10px] text-muted-foreground/80 truncate leading-none">{label}</span>
                </div>
              );
            }
            
            // Generic source
            if (lead.source) {
              return (
                <div className="flex items-center gap-1.5 -mt-1 mb-1 min-w-0">
                  <div className="h-3 w-3 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <Zap className="h-2 w-2 text-primary" />
                  </div>
                  <span className="text-[10px] text-muted-foreground/80 truncate leading-none capitalize">{lead.source}</span>
                </div>
              );
            }

            return null;
          })()}

          {/* Separador */}
          <div className="border-t border-border/50 my-2 -mx-3" />

          {/* Linha de ações rápidas e infos */}
          <TooltipProvider delayDuration={100}>
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Avatar do responsável ou badge "Sem responsável" / "Atribuindo..." */}
              {lead.assignee ? <Tooltip>
                  <TooltipTrigger asChild>
                    <Avatar className="h-6 w-6 ring-2 ring-background shrink-0">
                      <AvatarImage src={lead.assignee.avatar_url} />
                      <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
                        {lead.assignee.name?.[0] || ''}
                      </AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {lead.assignee.name}
                  </TooltipContent>
                </Tooltip> : isRecentlyCreated ? (
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0.5 animate-pulse">
                    <Loader2 className="h-2 w-2 mr-1 animate-spin" />
                    Atribuindo...
                  </Badge>
                ) : <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="destructive" className="text-[9px] px-1.5 py-0.5 cursor-pointer hover:bg-destructive/90 transition-colors" onClick={e => {
                e.stopPropagation();
                onAssignNow?.(lead.id);
              }}>
                      Sem responsável
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Clique para atribuir via round-robin
                  </TooltipContent>
                </Tooltip>}

              {/* Ícones de ação */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onMouseDown={e => e.stopPropagation()} onClick={handlePhoneClick} disabled={!hasPhone} className={cn("h-6 w-6 rounded-full flex items-center justify-center transition-colors", hasPhone ? iconColors.phone : "bg-muted text-muted-foreground/50 cursor-not-allowed")}>
                    <Phone className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {hasPhone ? `Ligar: ${formatPhoneForDisplay(lead.phone)}` : 'Sem telefone'}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button onMouseDown={e => e.stopPropagation()} onClick={handleWhatsAppClick} disabled={!hasPhone} className={cn("h-6 w-6 rounded-full flex items-center justify-center transition-colors", hasPhone ? iconColors.whatsapp : "bg-muted text-muted-foreground/50 cursor-not-allowed")}>
                    <MessageCircle className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {hasPhone ? (lead.has_whatsapp_messages ? 'Ver Mensagens' : 'Enviar WhatsApp') : 'Sem telefone'}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button onMouseDown={e => e.stopPropagation()} onClick={handleEmailClick} disabled={!hasEmail} className={cn("h-6 w-6 rounded-full flex items-center justify-center transition-colors", hasEmail ? iconColors.email : "bg-muted text-muted-foreground/50 cursor-not-allowed")}>
                    <Mail className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {hasEmail ? `Email: ${lead.email}` : 'Sem email'}
                </TooltipContent>
              </Tooltip>

              {/* Valor do imóvel/interesse */}
              {valorInteresse > 0 && <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                      interestPlanPrice 
                        ?
                         "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950" 
                        : "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950"
                    )}>
                      {formatCurrency(valorInteresse)}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {interestLabel ? (
                      <div className="space-y-0.5">
                        <div className="font-medium">{interestLabel}</div>
                        <div>R${valorInteresse.toLocaleString('pt-BR')}</div>
                      </div>
                    ) : (
                      <>Valor: R${valorInteresse.toLocaleString('pt-BR')}</>
                    )}
                  </TooltipContent>
                </Tooltip>}

              {/* SLA Badge - shows warning/overdue status */}
              {lead.assigned_user_id && !lead.first_response_seconds && (
                <SlaBadge slaStatus={lead.sla_status} slaSecondsElapsed={lead.sla_seconds_elapsed} firstResponseAt={lead.first_response_at} />
              )}


              {/* Tempo no estágio */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground ml-auto">
                    <Clock className="h-3 w-3" />
                    {stageTime}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Tempo neste estágio
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>}
    </Draggable>

    {/* Outcome Dialog for Phone/Email */}
    <TaskOutcomeDialog
      open={outcomeDialogOpen}
      onOpenChange={setOutcomeDialogOpen}
      taskType={outcomeType}
      taskTitle={outcomeType === 'call' ? 'Tentativa de ligação' : 'Email enviado'}
      onConfirm={handleOutcomeConfirm}
      isLoading={createActivity.isPending}
    />
  </>;
});
