import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Send, History, CheckCircle2, Clock, XCircle, Info } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ACTION_OPTIONS = [
  { value: 'call_made', label: 'Ligação Externa' },
  { value: 'message_sent', label: 'Mensagem Enviada' },
  { value: 'visit_scheduled', label: 'Visita Agendada' },
  { value: 'visit_confirmed', label: 'Visita Realizada' },
  { value: 'meeting_scheduled', label: 'Reunião Agendada' },
  { value: 'meeting_held', label: 'Reunião Externa' },
  { value: 'proposal_sent', label: 'Proposta Enviada' },
  { value: 'contract_signed', label: 'Contrato Assinado' },
  { value: 'property_created', label: 'Captação de Imóvel' },
];

export function ManualEntryForm() {
  const { user, organization, profile, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isAdmin = profile?.role === 'admin' || isSuperAdmin;

  const [formData, setFormData] = useState({
    action_key: '',
    quantity: 1,
    notes: '',
  });

  const { data: myEntries, isLoading } = useQuery({
    queryKey: ['my-manual-entries', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gamification_manual_entries' as any)
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id
  });

  const { data: pendingApprovals } = useQuery({
    queryKey: ['pending-manual-entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gamification_manual_entries' as any)
        .select(`
          *,
          profiles:user_id (name)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: isAdmin
  });

  const submitMutation = useMutation({
    mutationFn: async (values: any) => {
      setIsSubmitting(true);
      const { error } = await supabase
        .from('gamification_manual_entries' as any)
        .insert([{
          ...values,
          user_id: user?.id,
          organization_id: organization?.id,
          status: 'pending'
        }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-manual-entries'] });
      toast.success('Solicitação enviada para aprovação!');
      setFormData({ action_key: '', quantity: 1, notes: '' });
      setIsSubmitting(false);
    },
    onError: (err: any) => {
      toast.error('Erro ao enviar: ' + err.message);
      setIsSubmitting(false);
    }
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, status, reason }: { id: string, status: string, reason?: string }) => {
      const { error } = await supabase
        .from('gamification_manual_entries' as any)
        .update({ 
          status, 
          approved_by: user?.id, 
          approved_at: new Date().toISOString(),
          rejection_reason: reason || null
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-manual-entries'] });
      queryClient.invalidateQueries({ queryKey: ['my-manual-entries'] });
      queryClient.invalidateQueries({ queryKey: ['gamification-leaderboard-full'] });
      toast.success('Status atualizado com sucesso!');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.action_key) return toast.error('Selecione uma ação');
    submitMutation.mutate(formData);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Novo Lançamento Manual</CardTitle>
          <CardDescription>Registre atividades externas para pontuar.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de Atividade</Label>
              <Select 
                value={formData.action_key} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, action_key: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a ação..." />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input 
                type="number" 
                min="1" 
                max="100" 
                value={formData.quantity}
                onChange={(e) => setFormData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Observações / Evidência</Label>
              <Textarea 
                placeholder="Ex: Reunião com cliente X no café Y" 
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>

            <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
              <Send className="h-4 w-4" />
              Enviar para Aprovação
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-4 w-4" />
              Últimas Solicitações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {myEntries?.map((entry: any) => (
                <div key={entry.id} className="flex items-center justify-between p-2 border rounded-lg bg-muted/20">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{ACTION_OPTIONS.find(o => o.value === entry.action_key)?.label || entry.action_key}</p>
                    <p className="text-[10px] text-muted-foreground">{format(new Date(entry.created_at), 'dd/MM HH:mm')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {entry.status === 'rejected' && entry.rejection_reason && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-red-400 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-[200px] text-xs">Motivo: {entry.rejection_reason}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    <Badge variant={entry.status === 'approved' ? 'default' : entry.status === 'rejected' ? 'destructive' : 'secondary'}>
                      {entry.status === 'approved' ? <CheckCircle2 className="h-3 w-3 mr-1" /> : 
                       entry.status === 'rejected' ? <XCircle className="h-3 w-3 mr-1" /> : 
                       <Clock className="h-3 w-3 mr-1" />}
                      {entry.status === 'approved' ? 'Aprovado' : entry.status === 'rejected' ? 'Rejeitado' : 'Pendente'}
                    </Badge>
                  </div>
                </div>
              ))}
              {(!myEntries || myEntries.length === 0) && (
                <p className="text-xs text-center text-muted-foreground py-4">Nenhum lançamento manual ainda.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {isAdmin && pendingApprovals && pendingApprovals.length > 0 && (
          <Card className="border-orange-200 bg-orange-50/20">
            <CardHeader>
              <CardTitle className="text-lg text-orange-700">Aprovações Pendentes (Admin)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingApprovals.map((entry: any) => (
                  <div key={entry.id} className="p-3 border rounded-lg bg-card shadow-sm space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-black">{entry.profiles?.name}</p>
                        <p className="text-xs">{ACTION_OPTIONS.find(o => o.value === entry.action_key)?.label} ({entry.quantity}x)</p>
                      </div>
                      <div className="flex gap-1">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-7 w-7 p-0 text-emerald-600"
                          onClick={() => approveMutation.mutate({ id: entry.id, status: 'approved' })}
                          title="Aprovar"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-7 w-7 p-0 text-red-600"
                              title="Rejeitar"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Rejeitar Solicitação</DialogTitle>
                              <DialogDescription>
                                Informe o motivo da rejeição para o corretor.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                              <Label htmlFor="reason">Motivo</Label>
                              <Textarea 
                                id="reason" 
                                placeholder="Ex: Evidência insuficiente, duplicidade..." 
                                className="mt-2"
                                onBlur={(e) => (entry._temp_reason = e.target.value)}
                              />
                            </div>
                            <DialogFooter>
                              <Button 
                                variant="destructive" 
                                onClick={() => approveMutation.mutate({ 
                                  id: entry.id, 
                                  status: 'rejected', 
                                  reason: entry._temp_reason 
                                })}
                              >
                                Confirmar Rejeição
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                    {entry.notes && <p className="text-[10px] text-muted-foreground italic border-t pt-1">"{entry.notes}"</p>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

