import { useState, useEffect } from 'react';
import { maskCPF, maskRG } from '@/lib/masks';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PhoneInput } from '@/components/ui/phone-input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Save, User, MapPin, FileText, Cpu, CreditCard } from 'lucide-react';
import { useTelecomCustomerByLead, useUpsertTelecomCustomerFromLead } from '@/hooks/use-telecom-customer-by-lead';
import { useServicePlans } from '@/hooks/use-service-plans';
import { useCoverageUFs, useCoverageCities, useCoverageNeighborhoods } from '@/hooks/use-coverage-areas';
import { useUpdateLead } from '@/hooks/use-leads';
import { TELECOM_CUSTOMER_STATUSES, CHIP_CATEGORIES, MESH_REPEATER_OPTIONS, PAYMENT_METHODS, DUE_DAY_OPTIONS } from '@/hooks/use-telecom-customers';

interface TelecomCustomerTabProps {
  lead: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
  };
  onSaved?: () => void;
}

interface FormData {
  name: string;
  phone: string;
  phone2: string;
  is_portability: boolean;
  email: string;
  cpf_cnpj: string;
  rg: string;
  birth_date: string;
  mother_name: string;
  address: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  uf: string;
  cep: string;
  plan_id: string;
  plan_value: number | null;
  due_day: number | null;
  payment_method: string;
  status: string;
  contract_date: string;
  installation_date: string;
  chip_category: string;
  chip_quantity: number | null;
  mesh_repeater: string;
  mesh_quantity: number | null;
  is_combo: boolean;
  notes: string;
}

const defaultFormData: FormData = {
  name: '',
  phone: '',
  phone2: '',
  is_portability: false,
  email: '',
  cpf_cnpj: '',
  rg: '',
  birth_date: '',
  mother_name: '',
  address: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  uf: '',
  cep: '',
  plan_id: '',
  plan_value: null,
  due_day: null,
  payment_method: '',
  status: 'NOVO',
  contract_date: '',
  installation_date: '',
  chip_category: '',
  chip_quantity: null,
  mesh_repeater: '',
  mesh_quantity: null,
  is_combo: false,
  notes: '',
};

export function TelecomCustomerTab({ lead, onSaved }: TelecomCustomerTabProps) {
  const [formData, setFormData] = useState<FormData>(defaultFormData);

  const { data: customer, isLoading: isLoadingCustomer } = useTelecomCustomerByLead(lead.id);
  const { data: plans = [] } = useServicePlans();
  const activePlans = plans.filter(p => p.is_active);

  const ufs = useCoverageUFs();
  const cities = useCoverageCities(formData.uf);
  const neighborhoods = useCoverageNeighborhoods(formData.uf, formData.city);

  const upsertCustomer = useUpsertTelecomCustomerFromLead();
  const updateLead = useUpdateLead();

  // Initialize form with customer or lead data
  useEffect(() => {
    if (customer) {
      setFormData({
        name: customer.name || lead.name || '',
        phone: customer.phone || lead.phone || '',
        phone2: customer.phone2 || '',
        is_portability: (customer as any).is_portability || false,
        email: customer.email || lead.email || '',
        cpf_cnpj: customer.cpf_cnpj || '',
        rg: customer.rg || '',
        birth_date: customer.birth_date || '',
        mother_name: customer.mother_name || '',
        address: customer.address || '',
        number: customer.number || '',
        complement: customer.complement || '',
        neighborhood: customer.neighborhood || '',
        city: customer.city || '',
        uf: customer.uf || '',
        cep: customer.cep || '',
        plan_id: customer.plan_id || '',
        plan_value: customer.plan_value,
        due_day: customer.due_day,
        payment_method: customer.payment_method || '',
        status: customer.status || 'NOVO',
        contract_date: customer.contract_date || '',
        installation_date: customer.installation_date || '',
        chip_category: customer.chip_category || '',
        chip_quantity: customer.chip_quantity,
        mesh_repeater: customer.mesh_repeater || '',
        mesh_quantity: customer.mesh_quantity,
        is_combo: customer.is_combo || false,
        notes: customer.notes || '',
      });
    } else {
      setFormData({
        ...defaultFormData,
        name: lead.name || '',
        phone: lead.phone || '',
        email: lead.email || '',
      });
    }
  }, [customer, lead]);

  const handlePlanChange = (planId: string) => {
    const plan = activePlans.find(p => p.id === planId);
    setFormData(prev => ({
      ...prev,
      plan_id: planId,
      plan_value: plan?.price ?? null,
    }));
  };

  const handleUfChange = (uf: string) => {
    setFormData(prev => ({
      ...prev,
      uf,
      city: '',
      neighborhood: '',
    }));
  };

  const handleCityChange = (city: string) => {
    setFormData(prev => ({
      ...prev,
      city,
      neighborhood: '',
    }));
  };

  const handleSubmit = async () => {
    // Update lead basic info
    await updateLead.mutateAsync({
      id: lead.id,
      name: formData.name,
      phone: formData.phone || null,
      email: formData.email || null,
    });

    // Upsert telecom customer
    await upsertCustomer.mutateAsync({
      leadId: lead.id,
      name: formData.name,
      phone: formData.phone || null,
      phone2: formData.phone2 || null,
      is_portability: formData.is_portability,
      email: formData.email || null,
      cpf_cnpj: formData.cpf_cnpj || null,
      rg: formData.rg || null,
      birth_date: formData.birth_date || null,
      mother_name: formData.mother_name || null,
      address: formData.address || null,
      number: formData.number || null,
      complement: formData.complement || null,
      neighborhood: formData.neighborhood || null,
      city: formData.city || null,
      uf: formData.uf || null,
      cep: formData.cep || null,
      plan_id: formData.plan_id || null,
      plan_value: formData.plan_value,
      due_day: formData.due_day,
      payment_method: formData.payment_method || null,
      status: formData.status,
      contract_date: formData.contract_date || null,
      installation_date: formData.installation_date || null,
      chip_category: formData.chip_category || null,
      chip_quantity: formData.chip_quantity,
      mesh_repeater: formData.mesh_repeater || null,
      mesh_quantity: formData.mesh_quantity,
      is_combo: formData.is_combo,
      notes: formData.notes || null,
    });

    onSaved?.();
  };

  const isLoading = upsertCustomer.isPending || updateLead.isPending;

  if (isLoadingCustomer) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-4">
      {/* Personal Data */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <User className="h-4 w-4" />
          Dados Pessoais
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs">Nome *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Nome completo"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cpf_cnpj" className="text-xs">CPF</Label>
            <Input
              id="cpf_cnpj"
              value={formData.cpf_cnpj}
              onChange={e => setFormData(prev => ({ ...prev, cpf_cnpj: maskCPF(e.target.value) }))}
              placeholder="000.000.000-00"
              maxLength={14}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rg" className="text-xs">RG</Label>
            <Input
              id="rg"
              value={formData.rg}
              onChange={e => setFormData(prev => ({ ...prev, rg: maskRG(e.target.value) }))}
              placeholder="00.000.000-0"
              maxLength={12}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="birth_date" className="text-xs">Data de Nascimento</Label>
            <Input
              id="birth_date"
              type="date"
              value={formData.birth_date}
              onChange={e => setFormData(prev => ({ ...prev, birth_date: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-xs">WhatsApp</Label>
            <PhoneInput
              value={formData.phone}
              onChange={phone => setFormData(prev => ({ ...prev, phone }))}
              placeholder="WhatsApp principal"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone2" className="text-xs">Telefone 2</Label>
            <PhoneInput
              value={formData.phone2}
              onChange={phone2 => setFormData(prev => ({ ...prev, phone2 }))}
              placeholder="Telefone secundário"
            />
          </div>
          <div className="sm:col-span-2 flex items-center gap-2 pt-4">
            <Checkbox
              id="is_portability_tab"
              checked={formData.is_portability}
              onCheckedChange={checked => setFormData(prev => ({ ...prev, is_portability: !!checked }))}
            />
            <Label htmlFor="is_portability_tab" className="text-sm cursor-pointer">Este número é portabilidade</Label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="email@exemplo.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mother_name" className="text-xs">Nome da Mãe</Label>
            <Input
              id="mother_name"
              value={formData.mother_name}
              onChange={e => setFormData(prev => ({ ...prev, mother_name: e.target.value }))}
              placeholder="Nome completo da mãe"
            />
          </div>
        </div>
      </div>

      {/* Address */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <MapPin className="h-4 w-4" />
          Endereço
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">UF</Label>
            <Select value={formData.uf} onValueChange={handleUfChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {ufs.map(uf => (
                  <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Cidade</Label>
            <Select value={formData.city} onValueChange={handleCityChange} disabled={!formData.uf}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {cities.map(city => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Bairro</Label>
            <Select 
              value={formData.neighborhood} 
              onValueChange={neighborhood => setFormData(prev => ({ ...prev, neighborhood }))}
              disabled={!formData.city}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {neighborhoods.map(nb => (
                  <SelectItem key={nb} value={nb}>{nb}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="address" className="text-xs">Endereço</Label>
            <Input
              id="address"
              value={formData.address}
              onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))}
              placeholder="Rua, Avenida..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="number" className="text-xs">Número</Label>
            <Input
              id="number"
              value={formData.number}
              onChange={e => setFormData(prev => ({ ...prev, number: e.target.value }))}
              placeholder="Nº"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cep" className="text-xs">CEP</Label>
            <Input
              id="cep"
              value={formData.cep}
              onChange={e => setFormData(prev => ({ ...prev, cep: e.target.value }))}
              placeholder="00000-000"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="complement" className="text-xs">Complemento</Label>
          <Input
            id="complement"
            value={formData.complement}
            onChange={e => setFormData(prev => ({ ...prev, complement: e.target.value }))}
            placeholder="Apto, Bloco..."
          />
        </div>
      </div>

      {/* Plan and Contract */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <FileText className="h-4 w-4" />
          Plano e Contrato
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Plano</Label>
            <Select value={formData.plan_id} onValueChange={handlePlanChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o plano" />
              </SelectTrigger>
              <SelectContent>
                {activePlans.map(plan => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name} - R$ {plan.price?.toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan_value" className="text-xs">Valor do Plano</Label>
            <Input
              id="plan_value"
              type="number"
              step="0.01"
              value={formData.plan_value ?? ''}
              onChange={e => setFormData(prev => ({ ...prev, plan_value: e.target.value ? parseFloat(e.target.value) : null }))}
              placeholder="0,00"
            />
          </div>
        </div>

        {/* Due Day Selection */}
        <div className="space-y-2">
          <Label className="text-xs">Vencimento</Label>
          <RadioGroup
            value={formData.due_day?.toString() || ''}
            onValueChange={value => setFormData(prev => ({ ...prev, due_day: parseInt(value) }))}
            className="flex flex-wrap gap-4"
          >
            {DUE_DAY_OPTIONS.map(day => (
              <div key={day} className="flex items-center space-x-2">
                <RadioGroupItem value={day.toString()} id={`due-day-${day}`} />
                <Label htmlFor={`due-day-${day}`} className="text-sm cursor-pointer">{day}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        {/* Payment Method Selection */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <CreditCard className="h-4 w-4" />
            Forma de Pagamento
          </div>
          <RadioGroup
            value={formData.payment_method}
            onValueChange={payment_method => setFormData(prev => ({ ...prev, payment_method }))}
            className="grid grid-cols-2 gap-2"
          >
            {PAYMENT_METHODS.map(method => (
              <div key={method.value} className="flex items-center space-x-2">
                <RadioGroupItem value={method.value} id={`payment-${method.value}`} />
                <Label htmlFor={`payment-${method.value}`} className="text-sm cursor-pointer">{method.label}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={formData.status} onValueChange={status => setFormData(prev => ({ ...prev, status }))}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {TELECOM_CUSTOMER_STATUSES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contract_date" className="text-xs">Data Contrato</Label>
            <Input
              id="contract_date"
              type="date"
              value={formData.contract_date}
              onChange={e => setFormData(prev => ({ ...prev, contract_date: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="installation_date" className="text-xs">Data Instalação</Label>
            <Input
              id="installation_date"
              type="date"
              value={formData.installation_date}
              onChange={e => setFormData(prev => ({ ...prev, installation_date: e.target.value }))}
            />
          </div>
        </div>
      </div>

      {/* Equipment */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Cpu className="h-4 w-4" />
          Equipamentos
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Categoria Chip</Label>
            <Select 
              value={formData.chip_category} 
              onValueChange={chip_category => setFormData(prev => ({ ...prev, chip_category }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {CHIP_CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="chip_quantity" className="text-xs">Qtd Chips</Label>
            <Input
              id="chip_quantity"
              type="number"
              min={0}
              value={formData.chip_quantity ?? ''}
              onChange={e => setFormData(prev => ({ ...prev, chip_quantity: e.target.value ? parseInt(e.target.value) : null }))}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Repetidor Mesh</Label>
            <Select 
              value={formData.mesh_repeater} 
              onValueChange={mesh_repeater => setFormData(prev => ({ ...prev, mesh_repeater }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {MESH_REPEATER_OPTIONS.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mesh_quantity" className="text-xs">Qtd Mesh</Label>
            <Input
              id="mesh_quantity"
              type="number"
              min={0}
              value={formData.mesh_quantity ?? ''}
              onChange={e => setFormData(prev => ({ ...prev, mesh_quantity: e.target.value ? parseInt(e.target.value) : null }))}
              placeholder="0"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="is_combo"
            checked={formData.is_combo}
            onCheckedChange={checked => setFormData(prev => ({ ...prev, is_combo: !!checked }))}
          />
          <Label htmlFor="is_combo" className="text-sm cursor-pointer">É Combo?</Label>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes" className="text-xs">Observações</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
          placeholder="Observações sobre o cliente..."
          rows={3}
        />
      </div>

      {/* Save Button */}
      <Button 
        onClick={handleSubmit} 
        disabled={isLoading || !formData.name.trim()}
        className="w-full"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Salvando...
          </>
        ) : (
          <>
            <Save className="h-4 w-4 mr-2" />
            Salvar Cliente
          </>
        )}
      </Button>
    </div>
  );
}
