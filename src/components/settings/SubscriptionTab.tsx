import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreditCard, Calendar, History, Building2, User, Loader2, AlertCircle, CheckCircle2, Receipt, QrCode, FileText, Copy, Download, ExternalLink, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function SubscriptionTab() {
  const { organization, profile, refreshProfile, isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState<any>(null);

  // Card details
  const [cardInfo, setCardInfo] = useState({
    name: '', number: '', expMonth: '', expYear: '', ccv: ''
  });

  const [billingInfo, setBillingInfo] = useState({
    name: '', taxId: '', cep: '', endereco: '', numero: '',
    complemento: '', bairro: '', cidade: '', uf: '', email: '', telefone: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!organization?.id) return;
      try {
        const { data: org } = await supabase.from('organizations').select('*').eq('id', organization.id).maybeSingle();
        let plan = null;
        if (org?.plan_id) {
          const { data: p } = await supabase.from('admin_subscription_plans').select('*').eq('id', org.plan_id).maybeSingle();
          plan = p;
        }
        const { data: hist } = await supabase.from('asaas_payments').select('*').eq('organization_id', organization.id).order('due_date', { ascending: false });
        setData({ org, plan });
        setHistory(hist || []);
        if (org) {
          setBillingInfo({
            name: org.razao_social || org.name || '',
            taxId: org.cnpj || '',
            cep: org.cep || '',
            endereco: org.endereco || '',
            numero: org.numero || '',
            complemento: org.complemento || '',
            bairro: org.bairro || '',
            cidade: org.cidade || '',
            uf: org.uf || '',
            email: org.email || '',
            telefone: org.telefone || org.whatsapp || '',
          });
        }
      } catch (error) { console.error(error); } finally { setLoading(false); }
    };
    fetchData();
  }, [organization?.id]);

  const handleCheckout = async (type: 'PIX' | 'CREDIT_CARD' | 'BOLETO') => {
    if (!billingInfo.taxId || !billingInfo.name) {
      toast.error('Preencha os dados de faturamento antes de prosseguir');
      return;
    }
    setSubmitting(true);
    try {
      const body: any = {
        organization_id: organization?.id,
        billing_type: type,
        holder_email: billingInfo.email || profile?.email,
        holder_cpf_cnpj: billingInfo.taxId,
        holder_name: billingInfo.name,
        holder_phone: billingInfo.telefone || profile?.phone || (organization as any)?.telefone || (organization as any)?.whatsapp,
        holder_postal_code: billingInfo.cep,
        holder_address_number: billingInfo.numero,
      };

      if (type === 'CREDIT_CARD') {
        Object.assign(body, {
          card_number: cardInfo.number,
          expiry_month: cardInfo.expMonth,
          expiry_year: cardInfo.expYear,
          ccv: cardInfo.ccv,
        });
      }

      const { data, error } = await supabase.functions.invoke('asaas-create-charge', { body });
      if (error) throw error;
      setCheckoutResult(data);
      if (type === 'CREDIT_CARD') {
        toast.success('Assinatura processada!');
        await refreshProfile();
      } else {
        toast.success('Fatura gerada com sucesso!');
      }
    } catch (e: any) { toast.error(e.message); } finally { setSubmitting(false); }
  };

  const autoFillFromUser = () => {
    if (!profile) return;
    setBillingInfo({
      name: profile.name || '', taxId: profile.cpf || '', cep: profile.cep || '',
      endereco: profile.endereco || '', numero: profile.numero || '',
      complemento: profile.complemento || '', bairro: profile.bairro || '',
      cidade: profile.cidade || '', uf: profile.uf || '',
      email: profile.email || '', telefone: profile.phone || '',
    });
    toast.info('Dados importados do seu perfil');
  };

  const autoFillFromOrg = () => {
    if (!organization) return;
    const org = organization as any;
    setBillingInfo({
      name: org.razao_social || org.name || '',
      taxId: org.cnpj || '', 
      cep: org.cep || '',
      endereco: org.endereco || '', 
      numero: org.numero || '',
      complemento: org.complemento || '', 
      bairro: org.bairro || '',
      cidade: org.cidade || '', 
      uf: org.uf || '',
      email: org.email || '',
      telefone: org.telefone || org.whatsapp || '',
    });
    toast.info('Dados importados da empresa');
  };

  const handleSaveBilling = async () => {
    if (!organization?.id) return;
    setSaving(true);
    try {
      const isCnpj = billingInfo.taxId.replace(/\D/g, '').length > 11;
      const { error } = await supabase.from('organizations').update({
        razao_social: billingInfo.name,
        cnpj: isCnpj ? billingInfo.taxId : null,
        cep: billingInfo.cep,
        endereco: billingInfo.endereco,
        numero: billingInfo.numero,
        complemento: billingInfo.complemento,
        bairro: billingInfo.bairro,
        cidade: billingInfo.cidade,
        uf: billingInfo.uf,
      }).eq('id', organization.id);
      if (error) throw error;
      toast.success('Dados salvos com sucesso!');
      await refreshProfile();
    } catch (e) { toast.error('Erro ao salvar'); } finally { setSaving(false); }
  };

  if (loading) return <Skeleton className="h-[400px] w-full" />;

  const org = data?.org;
  const plan = data?.plan;
  const status = org?.subscription_status || 'pending';
  const nextBilling = org?.next_billing_date;

  const statusLabel: any = {
    active: { label: 'Ativa', variant: 'default' },
    trial: { label: 'Trial', variant: 'secondary' },
    pending: { label: 'Pendente', variant: 'destructive' },
    overdue: { label: 'Atrasada', variant: 'destructive' },
  };
  const s = statusLabel[status] || { label: status, variant: 'outline' };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="overflow-hidden border-primary/10">
            <CardHeader className="bg-primary/5 pb-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-xl font-semibold text-foreground flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    {plan?.name || org?.plan_name || 'Plano de Assinatura'}
                  </CardTitle>
                  <CardDescription className="mt-0.5 text-sm text-muted-foreground">{plan?.description || 'Gestão da sua assinatura Vimob'}</CardDescription>
                </div>
                <Badge variant={s.variant} className="uppercase">{s.label}</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Vencimento da Fatura</p>
                    <p className="text-lg font-bold">{nextBilling ? format(new Date(nextBilling + 'T12:00:00'), "dd 'de' MMMM, yyyy", { locale: ptBR }) : 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Valor Mensal</p>
                    <p className="text-lg font-bold">{Number(plan?.price || org?.subscription_value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  </div>
               </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-semibold text-foreground">Dados de Faturamento</CardTitle>
              <CardDescription>Usados para emissão de notas e boletos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 text-[10px] h-8" onClick={autoFillFromUser}><User className="h-3 w-3 mr-1" /> Perfil</Button>
                <Button variant="outline" size="sm" className="flex-1 text-[10px] h-8" onClick={autoFillFromOrg}><Building2 className="h-3 w-3 mr-1" /> Empresa</Button>
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label className="text-xs">Nome / Razão Social</Label><Input value={billingInfo.name} onChange={e => setBillingInfo({...billingInfo, name: e.target.value})} className="h-9" /></div>
                <div className="space-y-1.5"><Label className="text-xs">CPF ou CNPJ</Label><Input value={billingInfo.taxId} onChange={e => setBillingInfo({...billingInfo, taxId: e.target.value})} className="h-9" /></div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1.5"><Label className="text-xs">CEP</Label><Input value={billingInfo.cep} onChange={e => setBillingInfo({...billingInfo, cep: e.target.value})} className="h-9" /></div>
                  <div className="space-y-1.5 col-span-2"><Label className="text-xs">Cidade</Label><Input value={billingInfo.cidade} onChange={e => setBillingInfo({...billingInfo, cidade: e.target.value})} className="h-9" /></div>
                </div>
                <div className="space-y-1.5"><Label className="text-xs">Endereço</Label><Input value={billingInfo.endereco} onChange={e => setBillingInfo({...billingInfo, endereco: e.target.value})} className="h-9" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5"><Label className="text-xs">Número</Label><Input value={billingInfo.numero} onChange={e => setBillingInfo({...billingInfo, numero: e.target.value})} className="h-9" /></div>
                  <div className="space-y-1.5"><Label className="text-xs">UF</Label><Input value={billingInfo.uf} onChange={e => setBillingInfo({...billingInfo, uf: e.target.value.toUpperCase()})} maxLength={2} className="h-9" /></div>
                </div>
              </div>
              <Button onClick={handleSaveBilling} disabled={saving} className="w-full mt-2" variant="secondary">
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar Faturamento
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><History className="h-5 w-5" /> Histórico</CardTitle></CardHeader>
            <CardContent>
              <div className="relative overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b text-muted-foreground font-medium">
                      <th className="py-2">Vencimento</th>
                      <th className="py-2">Valor</th>
                      <th className="py-2">Status</th>
                      <th className="py-2 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {history.map(h => (
                      <tr key={h.id} className="hover:bg-muted/50 transition-colors">
                        <td className="py-3">{format(new Date(h.due_date), 'dd/MM/yyyy')}</td>
                        <td className="py-3 font-semibold">{Number(h.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                        <td className="py-3">
                          <Badge variant={h.status === 'RECEIVED' || h.status === 'CONFIRMED' ? 'default' : 'outline'} className="text-[10px]">
                            {h.status === 'RECEIVED' || h.status === 'CONFIRMED' ? 'Pago' : h.status}
                          </Badge>
                        </td>
                        <td className="py-3 text-right">
                          {h.invoice_url && <Button variant="ghost" size="sm" asChild><a href={h.invoice_url} target="_blank"><ExternalLink className="h-4 w-4" /></a></Button>}
                        </td>
                      </tr>
                    ))}
                    {history.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Nenhum pagamento encontrado</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {checkoutResult ? (
            <Card className="border-primary">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Pagamento Gerado
                  <Button variant="ghost" size="sm" onClick={() => setCheckoutResult(null)}>Alterar Método</Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {checkoutResult.type === 'PIX' && (
                  <div className="flex flex-col items-center gap-4 text-center">
                    <div className="p-4 bg-white rounded-xl shadow-inner">
                      <img src={`data:image/png;base64,${checkoutResult.qr_code}`} className="w-56 h-56" />
                    </div>
                    <div className="w-full space-y-2">
                      <Label className="text-xs text-muted-foreground">Copia e Cola</Label>
                      <div className="flex gap-2">
                        <Input value={checkoutResult.qr_payload} readOnly className="text-xs" />
                        <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(checkoutResult.qr_payload); toast.success('Copiado!'); }}><Copy className="h-4 w-4" /></Button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Aguardando confirmação...</p>
                  </div>
                )}
                {checkoutResult.type === 'BOLETO' && (
                  <div className="space-y-4">
                    <div className="p-6 bg-muted rounded-xl flex items-center gap-4">
                      <FileText className="h-10 w-10 text-primary" />
                      <div className="flex-1">
                        <p className="font-bold text-lg">Boleto Bancário</p>
                        <p className="text-sm text-muted-foreground">Vencimento: {format(new Date(), 'dd/MM/yyyy')}</p>
                      </div>
                      <Button asChild><a href={checkoutResult.bank_slip_url} target="_blank"><Download className="h-4 w-4 mr-2" /> Baixar PDF</a></Button>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Linha Digitável</Label>
                      <div className="flex gap-2">
                        <Input value={checkoutResult.identification_field} readOnly className="text-xs" />
                        <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(checkoutResult.identification_field); toast.success('Copiado!'); }}><Copy className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  </div>
                )}
                {checkoutResult.type === 'CREDIT_CARD' && (
                  <div className="text-center py-6 space-y-3">
                    <CheckCircle2 className="h-16 w-16 text-success mx-auto" />
                    <h3 className="text-xl font-bold">Assinatura Ativada</h3>
                    <p className="text-muted-foreground">Seu cartão foi processado e a assinatura está ativa.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pagamento de Assinatura</CardTitle>
                <CardDescription className="mt-0.5 text-sm text-muted-foreground">Selecione o método de pagamento para sua mensalidade</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="PIX">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="PIX"><QrCode className="w-4 h-4 mr-2" /> PIX</TabsTrigger>
                    <TabsTrigger value="BOLETO"><FileText className="w-4 h-4 mr-2" /> Boleto</TabsTrigger>
                    <TabsTrigger value="CARD"><CreditCard className="w-4 h-4 mr-2" /> Cartão</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="PIX" className="pt-6 space-y-4">
                    <p className="text-sm text-muted-foreground">Liberação imediata após o pagamento.</p>
                    <Button onClick={() => handleCheckout('PIX')} disabled={submitting} className="w-full">
                      {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Gerar QR Code PIX agora
                    </Button>
                  </TabsContent>

                  <TabsContent value="BOLETO" className="pt-6 space-y-4">
                    <p className="text-sm text-muted-foreground">Compensação em até 48h úteis.</p>
                    <Button onClick={() => handleCheckout('BOLETO')} disabled={submitting} className="w-full">
                      {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Gerar Boleto Bancário
                    </Button>
                  </TabsContent>

                  <TabsContent value="CARD" className="pt-6 space-y-4">
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label>Nome no Cartão</Label>
                        <Input value={cardInfo.name} onChange={e => setCardInfo({...cardInfo, name: e.target.value})} placeholder="Como impresso no cartão" />
                      </div>
                      <div className="space-y-2">
                        <Label>Número do Cartão</Label>
                        <Input value={cardInfo.number} onChange={e => setCardInfo({...cardInfo, number: e.target.value})} placeholder="0000 0000 0000 0000" />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-2">
                          <Label>Mês</Label>
                          <Input value={cardInfo.expMonth} onChange={e => setCardInfo({...cardInfo, expMonth: e.target.value})} placeholder="MM" />
                        </div>
                        <div className="space-y-2">
                          <Label>Ano</Label>
                          <Input value={cardInfo.expYear} onChange={e => setCardInfo({...cardInfo, expYear: e.target.value})} placeholder="AAAA" />
                        </div>
                        <div className="space-y-2">
                          <Label>CVV</Label>
                          <Input value={cardInfo.ccv} onChange={e => setCardInfo({...cardInfo, ccv: e.target.value})} placeholder="123" />
                        </div>
                      </div>
                      <Button onClick={() => handleCheckout('CREDIT_CARD')} disabled={submitting} className="w-full">
                        {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Assinar Agora
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}

          {isSuperAdmin && (
            <Card className="border-warning bg-warning/5">
              <CardHeader><CardTitle className="text-lg text-warning-foreground flex items-center gap-2"><Shield className="h-5 w-5" /> Super Admin</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">Você tem permissão para ajustar esta assinatura manualmente.</p>
                <Button variant="outline" className="w-full" asChild><a href="/admin/organizations">Gerenciar Organizações</a></Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

