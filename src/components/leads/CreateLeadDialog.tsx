import { useState, useEffect, useCallback, useRef } from 'react';
import { maskCPF, maskRG, maskPhone } from '@/lib/masks';
import { toast } from 'sonner';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PhoneInput } from '@/components/ui/phone-input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TagSelector } from '@/components/ui/tag-selector';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, User, Briefcase, Building2, MapPin, DollarSign, Trophy, XCircle, CircleDot, UserCheck, CreditCard, Calendar, FileText, X, Home } from 'lucide-react';
import { PropertyPickerDialog } from '@/components/properties/PropertyPickerDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPermissions } from '@/hooks/use-user-permissions';
import { useOrganizationUsers } from '@/hooks/use-users';
import { usePipelines, useStages } from '@/hooks/use-stages';
import { useProperties } from '@/hooks/use-properties';
import { useCreateLead } from '@/hooks/use-leads';
import { useUpsertTelecomCustomerFromLead } from '@/hooks/use-telecom-customer-by-lead';
import { useServicePlans } from '@/hooks/use-service-plans';
import { useCoverageUFs, useCoverageCities, useCoverageNeighborhoods } from '@/hooks/use-coverage-areas';
import { PAYMENT_METHODS, DUE_DAY_OPTIONS } from '@/hooks/use-telecom-customers';

interface CreateLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStageId?: string | null;
  defaultPipelineId?: string | null;
}

const dealStatusOptions = [
  { value: 'open', label: 'Aberto', icon: CircleDot, color: 'text-blue-500' },
  { value: 'won', label: 'Ganho', icon: Trophy, color: 'text-green-500' },
  { value: 'lost', label: 'Perdido', icon: XCircle, color: 'text-red-500' },
];

const faixaImovelOptions = [
  { value: 'ate_200k', label: 'Até R$ 200 mil' },
  { value: '200k_400k', label: 'R$ 200 mil - R$ 400 mil' },
  { value: '400k_600k', label: 'R$ 400 mil - R$ 600 mil' },
  { value: '600k_1m', label: 'R$ 600 mil - R$ 1 milhão' },
  { value: 'acima_1m', label: 'Acima de R$ 1 milhão' },
];

export function CreateLeadDialog({ 
  open, 
  onOpenChange, 
  defaultStageId, 
  defaultPipelineId 
}: CreateLeadDialogProps) {
  const { profile, organization } = useAuth();
  const { hasPermission } = useUserPermissions();
  const { data: allUsers = [] } = useOrganizationUsers();
  const users = hasPermission('lead_view_all') ? allUsers : allUsers.filter(u => u.id === profile?.id);
  const { data: pipelines = [] } = usePipelines();
  const { data: properties = [] } = useProperties();
  const { data: servicePlans = [] } = useServicePlans();
  const createLead = useCreateLead();
  const upsertTelecomCustomer = useUpsertTelecomCustomerFromLead();

  const isTelecom = organization?.segment === 'telecom';
  const dialogTitle = isTelecom ? 'Novo Cliente' : 'Novo Lead';
  const submitLabel = isTelecom ? 'Criar Cliente' : 'Criar Lead';

  // Form state
  const [activeTab, setActiveTab] = useState('basic');
  const [draftRestored, setDraftRestored] = useState(false);

  const draftKey = organization?.id ? `lead-draft-${organization.id}` : null;

  const getEmptyFormData = useCallback(() => ({
    name: '',
    phone: '',
    phone2: '',
    email: '',
    message: '',
    source: '',
    cpf: '',
    rg: '',
    birth_date: '',
    is_portability: false,
    mother_name: '',
    uf: '',
    cidade: '',
    bairro: '',
    endereco: '',
    numero: '',
    cep: '',
    plan_id: '',
    due_day: '',
    payment_method: '',
    cargo: '',
    empresa: '',
    profissao: '',
    renda_familiar: '',
    faixa_valor_imovel: '',
    valor_interesse: '',
    assigned_user_id: profile?.id || '',
    pipeline_id: defaultPipelineId || '',
    stage_id: defaultStageId || '',
    property_id: '',
    deal_status: 'open',
    is_own_resource: false,
    tag_ids: [] as string[],

  }), [profile?.id, defaultPipelineId, defaultStageId]);

  const [formData, setFormData] = useState(getEmptyFormData);

  // Get stages for selected pipeline
  const { data: stages = [] } = useStages(formData.pipeline_id || undefined);
  
  // Coverage areas for Telecom
  const coverageUFs = useCoverageUFs();
  const coverageCities = useCoverageCities(formData.uf);
  const coverageNeighborhoods = useCoverageNeighborhoods(formData.uf, formData.cidade);

  const isFormEmpty = useCallback((data: typeof formData) => {
    return !data.name.trim() && !data.phone && !data.email && !data.message && !data.cpf && !data.cargo && !data.empresa;
  }, []);

  // Save draft to localStorage with debounce
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!open || !draftKey) return;
    
    if (isFormEmpty(formData)) {
      localStorage.removeItem(draftKey);
      return;
    }

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ formData, activeTab }));
      } catch { /* quota exceeded â€” ignore */ }
    }, 500);

    return () => clearTimeout(saveTimerRef.current);
  }, [formData, activeTab, open, draftKey, isFormEmpty]);

  // Restore draft or reset form when dialog opens
  useEffect(() => {
    if (open) {
      setDraftRestored(false);
      
      if (draftKey) {
        try {
          const saved = localStorage.getItem(draftKey);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.formData && !isFormEmpty(parsed.formData)) {
              setFormData({ ...getEmptyFormData(), ...parsed.formData });
              if (parsed.activeTab) setActiveTab(parsed.activeTab);
              setDraftRestored(true);
              return;
            }
          }
        } catch { /* corrupted data â€” ignore */ }
      }

      setActiveTab('basic');
      const defaultPipeline = pipelines.find(p => p.is_default) || pipelines[0];
      setFormData({
        ...getEmptyFormData(),
        pipeline_id: defaultPipelineId || defaultPipeline?.id || '',
        stage_id: defaultStageId || '',
      });
    }
  }, [open, pipelines, defaultStageId, defaultPipelineId, draftKey, getEmptyFormData, isFormEmpty]);

  const discardDraft = useCallback(() => {
    if (draftKey) localStorage.removeItem(draftKey);
    setDraftRestored(false);
    setActiveTab('basic');
    const defaultPipeline = pipelines.find(p => p.is_default) || pipelines[0];
    setFormData({
      ...getEmptyFormData(),
      pipeline_id: defaultPipelineId || defaultPipeline?.id || '',
      stage_id: defaultStageId || '',
    });
  }, [draftKey, pipelines, defaultPipelineId, defaultStageId, getEmptyFormData]);

  // Prevent accidental close on backdrop click when form has data
  const handleInteractOutside = useCallback((e: Event) => {
    if (!isFormEmpty(formData)) {
      e.preventDefault();
    }
  }, [formData, isFormEmpty]);

  // Update stage when pipeline changes
  useEffect(() => {
    if (formData.pipeline_id && stages.length > 0 && !formData.stage_id) {
      setFormData(prev => ({ ...prev, stage_id: stages[0].id }));
    }
  }, [formData.pipeline_id, stages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Informe o nome do lead');
      setActiveTab('basic');
      return;
    }

    if (!formData.phone && !formData.email.trim()) {
      toast.error('Informe pelo menos um telefone ou email');
      setActiveTab('basic');
      return;
    }

    // Validate email format (only if provided)
    if (formData.email && !EMAIL_REGEX.test(formData.email.trim())) {
      toast.error('Email inválido. Use o formato nome@dominio.com');
      setActiveTab('basic');
      return;
    }

    // Validate phone has only digits and minimum length (only if provided)
    if (formData.phone) {
      const phoneDigits = formData.phone.replace(/\D/g, '');
      if (phoneDigits.length < 10) {
        toast.error('Telefone inválido. Informe DDD + número (mín. 10 dígitos).');
        setActiveTab('basic');
        return;
      }
    }

    try {
      const newLead = await createLead.mutateAsync({
        name: formData.name,
        phone: formData.phone || undefined,
        email: formData.email || undefined,
        message: formData.message || undefined,
        pipeline_id: formData.pipeline_id || undefined,
        stage_id: formData.stage_id || undefined,
        assigned_user_id: formData.assigned_user_id || undefined,
        tag_ids: formData.tag_ids.length > 0 ? formData.tag_ids : undefined,
        source: formData.source || 'manual',
        // Profile fields
        cargo: formData.cargo || undefined,
        empresa: formData.empresa || undefined,
        profissao: formData.profissao || undefined,
        renda_familiar: formData.renda_familiar || undefined,
        faixa_valor_imovel: formData.faixa_valor_imovel || undefined,
        valor_interesse: formData.valor_interesse ? parseFloat(formData.valor_interesse) : undefined,
        deal_status: formData.deal_status || 'open',
        is_own_resource: false,
      });
      
      // For Telecom: also create the telecom_customers record with all fields
      if (isTelecom && newLead?.id) {
        await upsertTelecomCustomer.mutateAsync({
          leadId: newLead.id,
          name: formData.name,
          phone: formData.phone || null,
          phone2: formData.phone2 || null,
          is_portability: formData.is_portability || false,
          email: formData.email || null,
          cpf_cnpj: formData.cpf || null,
          rg: formData.rg || null,
          birth_date: formData.birth_date || null,
          mother_name: formData.mother_name || null,
          uf: formData.uf || null,
          city: formData.cidade || null,
          neighborhood: formData.bairro || null,
          address: formData.endereco || null,
          number: formData.numero || null,
          cep: formData.cep || null,
          plan_id: formData.plan_id || null,
          due_day: formData.due_day ? parseInt(formData.due_day) : null,
          payment_method: formData.payment_method || null,
          status: 'NOVO',
        });
      }
      
      // Send notification for manual lead registration
      if (newLead?.id && formData.assigned_user_id) {
        try {
          const { notificationService } = await import('@/services/NotificationService');
          const assignedUser = allUsers.find(u => u.id === formData.assigned_user_id);
          
          await notificationService.send({
            eventKey: 'manual_lead_registered',
            organizationId: organization?.id || '',
            userId: formData.assigned_user_id,
            variables: {
              lead_name: formData.name,
              user_name: assignedUser?.name || 'Corretor'
            },
            dedupeKey: `manual_lead:${formData.phone}`
          });
        } catch (err) {
          console.error('Manual lead notification failed:', err);
        }
      }
      
      // Clear draft on success
      if (draftKey) localStorage.removeItem(draftKey);
      setDraftRestored(false);
      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const phoneDigits = formData.phone.replace(/\D/g, '');
  const hasValidPhone = !formData.phone || phoneDigits.length >= 10;
  const hasValidEmail = !formData.email.trim() || EMAIL_REGEX.test(formData.email.trim());
  const hasContactChannel = (!!formData.phone && hasValidPhone) || (!!formData.email.trim() && hasValidEmail);
  const hasRequiredLeadIdentity = !!formData.name.trim() && hasContactChannel;

  const validateBasicStep = () => {
    if (!formData.name.trim()) {
      toast.error('Informe o nome do lead');
      setActiveTab('basic');
      return false;
    }

    if (!formData.phone && !formData.email.trim()) {
      toast.error('Informe pelo menos um telefone ou email');
      setActiveTab('basic');
      return false;
    }

    if (formData.phone && !hasValidPhone) {
      toast.error('Telefone inválido. Informe DDD + número (mín. 10 dígitos).');
      setActiveTab('basic');
      return false;
    }

    if (formData.email.trim() && !hasValidEmail) {
      toast.error('Email inválido. Use o formato nome@dominio.com');
      setActiveTab('basic');
      return false;
    }

    return true;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[90%] sm:w-[650px] sm:max-w-[650px] p-0 flex flex-col overflow-hidden">
        <SheetHeader className="px-6 pt-6 pb-2 flex-shrink-0">
          <SheetTitle className="flex items-center gap-2">
            {isTelecom && <UserCheck className="h-5 w-5 text-primary" />}
            {dialogTitle}
          </SheetTitle>
        </SheetHeader>

        {/* Draft restored banner */}
        {draftRestored && (
          <div className="mx-6 flex items-center justify-between gap-2 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-3 py-2">
            <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
              <FileText className="h-4 w-4 flex-shrink-0" />
              <span>Rascunho restaurado</span>
            </div>
            <button
              type="button"
              onClick={discardDraft}
              className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 text-xs font-medium flex items-center gap-1"
            >
              <X className="h-3 w-3" />
              Descartar
            </button>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="px-6 pb-4">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-4">
                  <TabsTrigger value="basic" className="text-xs">Básico</TabsTrigger>
                  <TabsTrigger value="profile" className="text-xs">
                    {isTelecom ? 'Contrato' : 'Perfil'}
                  </TabsTrigger>
                  <TabsTrigger value="management" className="text-xs">Gestão</TabsTrigger>
                </TabsList>

                {/* Basic Info Tab */}
                <TabsContent value="basic" className="space-y-4 mt-0">
                  {isTelecom ? (
                    <>
                      {/* Telecom: Dados do Cliente */}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Nome *</Label>
                          <Input
                            value={formData.name}
                            onChange={(e) => updateField('name', e.target.value)}
                            placeholder="Nome do cliente"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>CPF</Label>
                          <Input
                            value={formData.cpf}
                            onChange={(e) => updateField('cpf', maskCPF(e.target.value))}
                            placeholder="000.000.000-00"
                            maxLength={14}
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>RG</Label>
                          <Input
                            value={formData.rg}
                            onChange={(e) => updateField('rg', maskRG(e.target.value))}
                            placeholder="00.000.000-0"
                            maxLength={12}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5" />
                            Data de Nascimento
                          </Label>
                          <Input
                            type="date"
                            value={formData.birth_date}
                            onChange={(e) => updateField('birth_date', e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>WhatsApp</Label>
                        <PhoneInput
                          value={formData.phone}
                          onChange={(value) => updateField('phone', value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Telefone 2</Label>
                        <PhoneInput
                          value={formData.phone2}
                          onChange={(value) => updateField('phone2', value)}
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="is_portability"
                          checked={formData.is_portability}
                          onCheckedChange={(checked) => updateField('is_portability', !!checked)}
                        />
                        <Label htmlFor="is_portability" className="text-sm cursor-pointer">
                          Este número é portabilidade
                        </Label>
                      </div>

                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={formData.email}
                          onChange={(e) => updateField('email', e.target.value)}
                          placeholder="email@exemplo.com"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Nome da Mãe</Label>
                        <Input
                          value={formData.mother_name}
                          onChange={(e) => updateField('mother_name', e.target.value)}
                          placeholder="Nome completo da mãe"
                        />
                      </div>

                      {/* Address Section */}
                      <div className="space-y-3 pt-2">
                        <Label className="flex items-center gap-2 text-sm font-medium">
                          <MapPin className="h-4 w-4" />
                          Endereço
                        </Label>
                        
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">UF</Label>
                            <Select 
                              value={formData.uf} 
                              onValueChange={(v) => {
                                updateField('uf', v);
                                updateField('cidade', '');
                                updateField('bairro', '');
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                {coverageUFs.map(uf => (
                                  <SelectItem key={uf} value={uf}>
                                    {uf}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Cidade</Label>
                            <Select 
                              value={formData.cidade} 
                              onValueChange={(v) => {
                                updateField('cidade', v);
                                updateField('bairro', '');
                              }}
                              disabled={!formData.uf}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                {coverageCities.map(city => (
                                  <SelectItem key={city} value={city}>
                                    {city}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Bairro</Label>
                            <Select 
                              value={formData.bairro} 
                              onValueChange={(v) => updateField('bairro', v)}
                              disabled={!formData.cidade}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                {coverageNeighborhoods.map(neighborhood => (
                                  <SelectItem key={neighborhood} value={neighborhood}>
                                    {neighborhood}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-6">
                          <div className="sm:col-span-3 space-y-2">
                            <Label className="text-xs text-muted-foreground">Endereço</Label>
                            <Input
                              value={formData.endereco}
                              onChange={(e) => updateField('endereco', e.target.value)}
                              placeholder="Rua, Avenida..."
                            />
                          </div>
                          <div className="sm:col-span-1 space-y-2">
                            <Label className="text-xs text-muted-foreground">Número</Label>
                            <Input
                              value={formData.numero}
                              onChange={(e) => updateField('numero', e.target.value)}
                              placeholder="Nº"
                            />
                          </div>
                          <div className="sm:col-span-2 space-y-2">
                            <Label className="text-xs text-muted-foreground">CEP</Label>
                            <Input
                              value={formData.cep}
                              onChange={(e) => updateField('cep', e.target.value)}
                              placeholder="00000-000"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Observações</Label>
                        <Textarea
                          value={formData.message}
                          onChange={(e) => updateField('message', e.target.value)}
                          placeholder="Interesse, observações iniciais..."
                          rows={3}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="space-y-4">
                      {/* Real Estate: Basic Info - Clean Layout */}
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Nome *</Label>
                        <Input
                          value={formData.name}
                          onChange={(e) => updateField('name', e.target.value)}
                          placeholder="Nome do lead"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">Telefone</Label>
                          <Input
                            value={formData.phone}
                            onChange={(e) => updateField('phone', maskPhone(e.target.value))}
                            placeholder="(00) 00000-0000"
                            inputMode="tel"
                            maxLength={15}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">Email</Label>
                          <Input
                            type="email"
                            value={formData.email}
                            onChange={(e) => updateField('email', e.target.value)}
                            placeholder="email@exemplo.com"
                            pattern="^[^\s@]+@[^\s@]+\.[^\s@]{2,}$"
                            title="Informe um email válido (ex: nome@dominio.com)"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Fonte</Label>
                        <Select
                          value={formData.source || "__none__"}
                          onValueChange={(v) => updateField('source', v === "__none__" ? '' : v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Como conheceu?" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Não informado</SelectItem>
                            <SelectItem value="site">Site</SelectItem>
                            <SelectItem value="indicacao">Indicação</SelectItem>
                            <SelectItem value="portais">Portais</SelectItem>
                            <SelectItem value="whatsapp">WhatsApp</SelectItem>
                            <SelectItem value="facebook">Facebook</SelectItem>
                            <SelectItem value="instagram">Instagram</SelectItem>
                            <SelectItem value="google">Google</SelectItem>
                            <SelectItem value="outro">Outro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Observações</Label>
                        <Textarea
                          value={formData.message}
                          onChange={(e) => updateField('message', e.target.value)}
                          placeholder="Interesse, observações iniciais..."
                          rows={2}
                        />
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Profile/Contract Tab */}
                <TabsContent value="profile" className="space-y-4 mt-0">
                  {isTelecom ? (
                    <>
                      {/* Telecom: Contract Info */}
                      <div className="space-y-2">
                        <Label>Plano</Label>
                        <Select 
                          value={formData.plan_id} 
                          onValueChange={(v) => updateField('plan_id', v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o plano" />
                          </SelectTrigger>
                          <SelectContent>
                            {servicePlans.filter(p => p.is_active).map(plan => (
                              <SelectItem key={plan.id} value={plan.id}>
                                {plan.name} {plan.price ? `- R$ ${plan.price.toFixed(2)}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-3">
                        <Label>Vencimento</Label>
                        <RadioGroup
                          value={formData.due_day}
                          onValueChange={(v) => updateField('due_day', v)}
                          className="flex flex-wrap gap-4"
                        >
                          {DUE_DAY_OPTIONS.map(day => (
                            <div key={day} className="flex items-center space-x-2">
                              <RadioGroupItem value={day.toString()} id={`due-${day}`} />
                              <Label htmlFor={`due-${day}`} className="font-normal cursor-pointer">
                                {day}
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>

                      <div className="space-y-3">
                        <Label className="flex items-center gap-2">
                          <CreditCard className="h-3.5 w-3.5" />
                          Forma de Pagamento
                        </Label>
                        <RadioGroup
                          value={formData.payment_method}
                          onValueChange={(v) => updateField('payment_method', v)}
                          className="grid grid-cols-2 gap-3"
                        >
                          {PAYMENT_METHODS.map(method => (
                            <div key={method.value} className="flex items-center space-x-2">
                              <RadioGroupItem value={method.value} id={`payment-${method.value}`} />
                              <Label htmlFor={`payment-${method.value}`} className="font-normal cursor-pointer">
                                {method.label}
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>

                      <div className="space-y-2">
                        <Label>Observações</Label>
                        <Textarea
                          value={formData.message}
                          onChange={(e) => updateField('message', e.target.value)}
                          placeholder="Observações sobre o cliente..."
                          rows={3}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Real Estate: Profile */}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Briefcase className="h-3.5 w-3.5" />
                            Cargo
                          </Label>
                          <Input
                            value={formData.cargo}
                            onChange={(e) => updateField('cargo', e.target.value)}
                            placeholder="Ex: Gerente, Diretor..."
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Building2 className="h-3.5 w-3.5" />
                            Empresa
                          </Label>
                          <Input
                            value={formData.empresa}
                            onChange={(e) => updateField('empresa', e.target.value)}
                            placeholder="Nome da empresa"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Profissão</Label>
                        <Input
                          value={formData.profissao}
                          onChange={(e) => updateField('profissao', e.target.value)}
                          placeholder="Área de atuação"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <DollarSign className="h-3.5 w-3.5" />
                          Renda Familiar
                        </Label>
                        <Input
                          value={formData.renda_familiar}
                          onChange={(e) => updateField('renda_familiar', e.target.value)}
                          placeholder="Ex: R$ 10.000"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Valor de Interesse (R$)</Label>
                        <Input
                          type="number"
                          value={formData.valor_interesse}
                          onChange={(e) => updateField('valor_interesse', e.target.value)}
                          placeholder="Ex: 500000"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Home className="h-3.5 w-3.5" />
                          Imóvel de Interesse
                        </Label>
                        <PropertyPickerDialog
                          properties={properties.map((p: any) => ({
                            id: p.id,
                            code: p.code,
                            title: p.title,
                            bairro: p.bairro,
                            cidade: p.cidade,
                            preco: p.preco,
                            imagem_principal: p.imagem_principal,
                            tipo_de_imovel: p.tipo_de_imovel,
                            tipo_de_negocio: p.tipo_de_negocio,
                            commission_percentage: p.commission_percentage,
                          }))}
                          selectedPropertyId={formData.property_id || null}
                          onSelect={(p) => {
                            updateField('property_id', p.id);
                            if (p.preco && !formData.valor_interesse) {
                              updateField('valor_interesse', String(p.preco));
                            }
                          }}
                        />
                      </div>
                    </>
                  )}
                </TabsContent>

                {/* Management Tab */}
                <TabsContent value="management" className="space-y-4 mt-0">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5" />
                        Responsável
                      </Label>
                      <Select 
                        value={formData.assigned_user_id} 
                        onValueChange={(v) => updateField('assigned_user_id', v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o responsável" />
                        </SelectTrigger>
                        <SelectContent>
                          {users.map(user => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Status do Negócio</Label>
                      <Select 
                        value={formData.deal_status} 
                        onValueChange={(v) => updateField('deal_status', v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {dealStatusOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                              <div className="flex items-center gap-2">
                                <opt.icon className={`h-3.5 w-3.5 ${opt.color}`} />
                                {opt.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Pipeline</Label>
                      <Select 
                        value={formData.pipeline_id} 
                        onValueChange={(v) => {
                          updateField('pipeline_id', v);
                          updateField('stage_id', '');
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a pipeline" />
                        </SelectTrigger>
                        <SelectContent>
                          {pipelines.map(p => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Estágio</Label>
                      <Select 
                        value={formData.stage_id} 
                        onValueChange={(v) => updateField('stage_id', v)}
                        disabled={!formData.pipeline_id}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o estágio" />
                        </SelectTrigger>
                        <SelectContent>
                          {stages.map(s => (
                            <SelectItem key={s.id} value={s.id}>
                              <div className="flex items-center gap-2">
                                <div 
                                  className="h-2.5 w-2.5 rounded-full" 
                                  style={{ backgroundColor: s.color }}
                                />
                                {s.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>


                  <div className="space-y-2">
                    <Label>Tags</Label>
                    <TagSelector
                      selectedTagIds={formData.tag_ids}
                      onSelectTag={(tagId) => {
                        if (!formData.tag_ids.includes(tagId)) {
                          updateField('tag_ids', [...formData.tag_ids, tagId]);
                        }
                      }}
                      onRemoveTag={(tagId) => {
                        updateField('tag_ids', formData.tag_ids.filter(id => id !== tagId));
                      }}
                      placeholder="Adicionar tags..."
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>

          <div className="flex gap-2 px-6 py-4 border-t bg-background flex-shrink-0">
            <Button type="button" variant="outline" className="w-[40%]" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            {activeTab !== 'management' ? (
              <Button
                type="button"
                className="w-[60%]"
                onClick={() => {
                  if (activeTab === 'basic') {
                    if (!validateBasicStep()) return;
                    setActiveTab('profile');
                  }
                  else if (activeTab === 'profile') setActiveTab('management');
                }}
              >
                Avançar
              </Button>
            ) : (
              <Button type="submit" className="w-[60%]" disabled={createLead.isPending || upsertTelecomCustomer.isPending || !hasRequiredLeadIdentity}>
                {(createLead.isPending || upsertTelecomCustomer.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {submitLabel}
              </Button>
            )}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
