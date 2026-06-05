import { useState } from 'react';
import { Copy, ClipboardList, Search, Filter, Share2, Users, Palette, Globe, Building2, User, Clock, Loader2, XCircle, CheckCircle2 } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAllOnboardingRequests,
  useUpdateOnboardingRequest,
  useActiveSubscriptionPlans,
  OnboardingRequest,
} from '@/hooks/use-onboarding-requests';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { OnboardingRequestCard } from '@/components/admin/onboarding/OnboardingRequestCard';
import { RequestDetailSheet } from '@/components/admin/onboarding/RequestDetailSheet';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminOnboarding() {
  const { data: requests = [], isLoading } = useAllOnboardingRequests();
  const { data: plans = [] } = useActiveSubscriptionPlans();
  const updateMutation = useUpdateOnboardingRequest();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState<OnboardingRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [approving, setApproving] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string; paymentUrl?: string } | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [confirmedValue, setConfirmedValue] = useState<string>('');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  const filteredRequests = requests.filter((req) => {
    const matchesSearch =
      req.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.responsible_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.responsible_email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: requests.length,
    pending: requests.filter((r) => r.status === 'pending').length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
  };

  const openDetail = (req: OnboardingRequest) => {
    setSelectedRequest(req);
    setAdminNotes(req.admin_notes || '');
    setSelectedPlanId('');
    setConfirmedValue('');
    setBillingCycle('monthly');
  };

  const handlePlanChange = (planId: string) => {
    setSelectedPlanId(planId);
    const plan = plans.find((p) => p.id === planId);
    if (plan) {
      setConfirmedValue(String(plan.price));
      const cycle = (plan.billing_cycle || '').toLowerCase();
      setBillingCycle(cycle === 'yearly' || cycle === 'annual' ? 'yearly' : 'monthly');
    }
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;
    if (!selectedPlanId || !confirmedValue || Number(confirmedValue) <= 0) {
      toast.error('Selecione um plano e confirme o valor antes de aprovar.');
      return;
    }
    
    setApproving(true);
    try {
      const { data, error } = await supabase.functions.invoke('approve-onboarding-request', {
        body: {
          requestId: selectedRequest.id,
          planId: selectedPlanId,
          confirmedValue: Number(confirmedValue),
          billingCycle: billingCycle,
          adminNotes: adminNotes,
          // The IP is handled on the server side
        },
      });

      if (error) {
        const response = (error as any).context;
        if (response && typeof response.json === 'function') {
          try {
            const body = await response.json();
            throw new Error(body?.error || body?.message || error.message);
          } catch (parseError: any) {
            if (parseError?.message && parseError.message !== error.message) {
              throw parseError;
            }
          }
        }
        throw error;
      }
      if (data.error) throw new Error(data.error);

      toast.success('Organização aprovada e link de pagamento enviado!');
      setSelectedRequest(null);
      setCreatedCredentials({
        email: data.email,
        password: data.password,
        paymentUrl: data.paymentUrl,
      });
      
      // We should also refresh the list
      window.location.reload(); // Simplest way to refresh everything
    } catch (err: any) {
      toast.error('Erro ao aprovar: ' + err.message);
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    await updateMutation.mutateAsync({
      id: selectedRequest.id,
      status: 'rejected',
      admin_notes: adminNotes,
    });
    toast.success('Solicitação rejeitada');
    setSelectedRequest(null);
  };

  return (
    <AdminLayout title="Fila de Aprovação">
      <div className="space-y-6">
        {/* Modern Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <p className="text-3xl font-black text-primary">{stats.total}</p>
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mt-1">Total Recebidas</p>
            </CardContent>
          </Card>
          <Card className="bg-amber-50/50 backdrop-blur-sm border-amber-100 shadow-sm">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <p className="text-3xl font-black text-amber-600">{stats.pending}</p>
              <p className="text-[10px] uppercase font-bold text-amber-700 tracking-widest mt-1">Aguardando Análise</p>
            </CardContent>
          </Card>
          <Card className="bg-emerald-50/50 backdrop-blur-sm border-emerald-100 shadow-sm">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <p className="text-3xl font-black text-emerald-600">{stats.approved}</p>
              <p className="text-[10px] uppercase font-bold text-emerald-700 tracking-widest mt-1">Aprovadas 30d</p>
            </CardContent>
          </Card>
          <Card className="bg-red-50/50 backdrop-blur-sm border-red-100 shadow-sm">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
              <p className="text-3xl font-black text-red-600">{stats.rejected}</p>
              <p className="text-[10px] uppercase font-bold text-red-700 tracking-widest mt-1">Rejeitadas/Spam</p>
            </CardContent>
          </Card>
        </div>

        {/* Search & Filter Header */}
        <div className="flex flex-col sm:flex-row gap-4 bg-card/30 p-4 rounded-2xl border border-border/40 backdrop-blur-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por empresa, nome ou e-mail..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="pl-10 bg-background/50 border-border/50 rounded-xl" 
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-56 bg-background/50 border-border/50 rounded-xl">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Status" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas solicitações</SelectItem>
              <SelectItem value="pending">Apenas Pendentes</SelectItem>
              <SelectItem value="approved">Apenas Aprovadas</SelectItem>
              <SelectItem value="rejected">Apenas Rejeitadas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Requests Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[200px] w-full rounded-2xl" />
            ))
          ) : filteredRequests.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-muted-foreground space-y-4 bg-card/20 rounded-3xl border border-dashed border-border">
              <ClipboardList className="h-12 w-12 opacity-20" />
              <p className="text-lg font-medium">Nenhuma solicitação encontrada.</p>
            </div>
          ) : (
            filteredRequests.map((req) => (
              <OnboardingRequestCard 
                key={req.id} 
                request={req} 
                onView={openDetail} 
              />
            ))
          )}
        </div>

        {/* Detail Sheet */}
        <RequestDetailSheet
          request={selectedRequest}
          onOpenChange={(open) => !open && setSelectedRequest(null)}
          plans={plans}
          selectedPlanId={selectedPlanId}
          onPlanChange={handlePlanChange}
          billingCycle={billingCycle}
          onBillingCycleChange={setBillingCycle}
          confirmedValue={confirmedValue}
          onConfirmedValueChange={setConfirmedValue}
          adminNotes={adminNotes}
          onAdminNotesChange={setAdminNotes}
          onApprove={handleApprove}
          onReject={handleReject}
          isApproving={approving}
          isProcessing={updateMutation.isPending}
        />

        {/* Credentials Dialog */}
        <Dialog open={!!createdCredentials} onOpenChange={(open) => !open && setCreatedCredentials(null)}>
          <DialogContent className="sm:max-w-md rounded-2xl shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-emerald-600 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" /> Acesso Criado com Sucesso
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="p-4 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-medium border border-emerald-100">
                Anote as credenciais abaixo para enviar ao usuário. A senha é única e não poderá ser recuperada pelo administrador depois.
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">E-mail de Login</label>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={createdCredentials?.email || ''} className="bg-muted/50 rounded-xl font-mono text-sm" />
                    <Button size="icon" variant="outline" className="rounded-xl shrink-0" onClick={() => { navigator.clipboard.writeText(createdCredentials?.email || ''); toast.success('E-mail copiado!'); }}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">Senha Provisória</label>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={createdCredentials?.password || ''} className="bg-muted/50 rounded-xl font-mono text-sm" />
                    <Button size="icon" variant="outline" className="rounded-xl shrink-0" onClick={() => { navigator.clipboard.writeText(createdCredentials?.password || ''); toast.success('Senha copiada!'); }}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {createdCredentials?.paymentUrl && (
                  <div className="space-y-2 pt-4 border-t border-border/50">
                    <label className="text-[10px] uppercase font-black text-primary tracking-widest">Link de Cobrança (Asaas)</label>
                    <div className="flex items-center gap-2">
                      <Input readOnly value={createdCredentials.paymentUrl} className="bg-primary/5 border-primary/20 rounded-xl text-primary text-xs" />
                      <Button size="icon" variant="outline" className="rounded-xl shrink-0 border-primary/20 text-primary" onClick={() => { navigator.clipboard.writeText(createdCredentials.paymentUrl!); toast.success('Link copiado!'); }}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground italic">
                      Este link já foi enviado automaticamente por WhatsApp ao responsável.
                    </p>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full rounded-xl" onClick={() => setCreatedCredentials(null)}>Concluir e Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
