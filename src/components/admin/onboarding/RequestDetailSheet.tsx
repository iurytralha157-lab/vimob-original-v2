import { 
  Building2, 
  User, 
  Palette, 
  Globe, 
  Share2, 
  Users, 
  Clock,
  XCircle,
  CheckCircle2,
  Loader2,
  CreditCard,
  Mail,
  MapPin,
  Phone,
  FileText,
  Briefcase
} from 'lucide-react';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle,
  SheetDescription,
  SheetFooter
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { OnboardingRequest } from '@/hooks/use-onboarding-requests';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

interface RequestDetailSheetProps {
  request: OnboardingRequest | null;
  onOpenChange: (open: boolean) => void;
  plans: any[];
  selectedPlanId: string;
  onPlanChange: (id: string) => void;
  billingCycle: 'monthly' | 'yearly';
  onBillingCycleChange: (v: 'monthly' | 'yearly') => void;
  confirmedValue: string;
  onConfirmedValueChange: (v: string) => void;
  adminNotes: string;
  onAdminNotesChange: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
  isApproving: boolean;
  isProcessing: boolean;
}

export function RequestDetailSheet({
  request,
  onOpenChange,
  plans,
  selectedPlanId,
  onPlanChange,
  billingCycle,
  onBillingCycleChange,
  confirmedValue,
  onConfirmedValueChange,
  adminNotes,
  onAdminNotesChange,
  onApprove,
  onReject,
  isApproving,
  isProcessing
}: RequestDetailSheetProps) {
  if (!request) return null;

  return (
    <Sheet open={!!request} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl p-0 flex flex-col h-full border-l border-border/40">
        <SheetHeader className="p-6 pb-2">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <SheetTitle className="text-xl font-bold">Análise de Solicitação</SheetTitle>
              <SheetDescription>
                Revise os dados e configure a nova conta do cliente.
              </SheetDescription>
            </div>
            <Badge variant={request.status === 'pending' ? 'secondary' : 'outline'} className="uppercase text-[10px] tracking-widest font-bold">
              {request.status}
            </Badge>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-8 py-4">
            {/* Empresa Section */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold flex items-center gap-2 text-primary uppercase tracking-wider">
                <Building2 className="h-4 w-4" /> Dados da Empresa
              </h4>
              <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-2xl border border-border/50">
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Nome da Empresa</p>
                  <p className="text-sm font-medium">{request.company_name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">CNPJ</p>
                  <p className="text-sm font-medium">{request.cnpj || 'Não informado'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Segmento</p>
                  <p className="text-sm font-medium">{request.segment || 'Geral'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">E-mail</p>
                  <p className="text-sm font-medium truncate">{request.company_email}</p>
                </div>
                <div className="space-y-1 col-span-2">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Localização</p>
                  <p className="text-sm font-medium flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {request.company_address}, {request.company_number} - {request.company_city}
                  </p>
                </div>
              </div>
            </div>

            {/* Responsável Section */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold flex items-center gap-2 text-primary uppercase tracking-wider">
                <User className="h-4 w-4" /> Responsável Principal
              </h4>
              <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-2xl border border-border/50">
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Nome Completo</p>
                  <p className="text-sm font-medium">{request.responsible_name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">CPF</p>
                  <p className="text-sm font-medium">{request.responsible_cpf || 'Não informado'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">WhatsApp</p>
                  <p className="text-sm font-medium flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {request.company_whatsapp || request.responsible_phone}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">E-mail de Acesso</p>
                  <p className="text-sm font-medium truncate">{request.responsible_email}</p>
                </div>
              </div>
            </div>

            {/* Configuração Visual Section */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold flex items-center gap-2 text-primary uppercase tracking-wider">
                <Palette className="h-4 w-4" /> Identidade e Site
              </h4>
              <div className="bg-muted/30 p-4 rounded-2xl border border-border/50 space-y-4">
                <div className="flex gap-4">
                  {request.logo_url && (
                    <div className="space-y-1 flex-1">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Logo</p>
                      <div className="h-16 w-16 rounded-xl border bg-white flex items-center justify-center p-2">
                        <img src={request.logo_url} alt="" className="h-full w-full object-contain" />
                      </div>
                    </div>
                  )}
                  <div className="space-y-1 flex-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Cor Primária</p>
                    <div className="flex items-center gap-2">
                      <div 
                        className="h-8 w-8 rounded-full border border-white shadow-sm" 
                        style={{ backgroundColor: request.primary_color || '#3b82f6' }} 
                      />
                      <code className="text-xs">{request.primary_color || '#3b82f6'}</code>
                    </div>
                  </div>
                </div>
                
                {request.site_title && (
                  <div className="space-y-1 pt-2 border-t border-border/50">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Título do Site</p>
                    <p className="text-sm font-medium">{request.site_title}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Approval Configuration Section */}
            {request.status === 'pending' && (
              <div className="space-y-4 pb-6">
                <h4 className="text-sm font-bold flex items-center gap-2 text-emerald-600 uppercase tracking-wider">
                  <CreditCard className="h-4 w-4" /> Configuração de Cobrança
                </h4>
                <div className="space-y-4 bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2 sm:col-span-1">
                      <label className="text-xs font-bold uppercase text-emerald-800">Plano</label>
                      <Select value={selectedPlanId} onValueChange={onPlanChange}>
                        <SelectTrigger className="bg-white rounded-xl border-emerald-200">
                          <SelectValue placeholder="Selecione o plano" />
                        </SelectTrigger>
                        <SelectContent>
                          {plans.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} — R$ {Number(p.price).toFixed(2)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 col-span-2 sm:col-span-1">
                      <label className="text-xs font-bold uppercase text-emerald-800">Ciclo</label>
                      <Select value={billingCycle} onValueChange={(v) => onBillingCycleChange(v as 'monthly' | 'yearly')}>
                        <SelectTrigger className="bg-white rounded-xl border-emerald-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Mensal</SelectItem>
                          <SelectItem value="yearly">Anual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 col-span-2">
                      <label className="text-xs font-bold uppercase text-emerald-800">Valor Final (R$)</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={confirmedValue}
                        onChange={(e) => onConfirmedValueChange(e.target.value)}
                        className="bg-white rounded-xl border-emerald-200 font-bold text-emerald-700"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Observações de Auditoria</label>
                  <Textarea 
                    value={adminNotes} 
                    onChange={e => onAdminNotesChange(e.target.value)} 
                    rows={3} 
                    placeholder="Notas internas sobre a aprovação..."
                    className="rounded-xl bg-muted/20 border-border/50" 
                  />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="p-6 pt-2 bg-background border-t border-border/40 gap-3">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {request.status === 'pending' && (
            <div className="flex gap-2 w-full sm:w-auto flex-[2]">
              <Button 
                variant="destructive" 
                className="flex-1 rounded-xl" 
                onClick={onReject} 
                disabled={isProcessing}
              >
                <XCircle className="h-4 w-4 mr-2" /> Rejeitar
              </Button>
              <Button 
                className="flex-[2] rounded-xl bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200" 
                onClick={onApprove} 
                disabled={isApproving || isProcessing}
              >
                {isApproving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Aprovar Cliente
              </Button>
            </div>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
