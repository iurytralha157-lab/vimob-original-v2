import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { AnimatedTabNav } from '@/components/ui/animated-tab-nav';
import { Plus, Loader2, ArrowLeft, Save, User, MapPin, Home, Settings2, Image, Globe, Key, DollarSign, Lock, Tag } from 'lucide-react';
import { useProperty, useCreateProperty, useUpdateProperty } from '@/hooks/use-properties';
import { usePropertyTypes, useCreatePropertyType } from '@/hooks/use-property-types';
import { usePropertyFeatures, useCreatePropertyFeature, useSeedDefaultFeatures, DEFAULT_FEATURES } from '@/hooks/use-property-features';
import { usePropertyProximities, useCreatePropertyProximity, useSeedDefaultProximities, DEFAULT_PROXIMITIES } from '@/hooks/use-property-proximities';
import { ImageUploader } from '@/components/properties/ImageUploader';
import { FeatureSelector } from '@/components/properties/FeatureSelector';
import { useUsers } from '@/hooks/use-users';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { cleanPropertyDescription } from '@/lib/property-description';
import { normalizePropertyStatus } from '@/lib/property-status';
import { toast } from 'sonner';

interface PropertyFormData {
  // Existing fields
  title: string;
  tipo_de_imovel: string;
  tipo_de_negocio: string;
  status: string;
  destaque: boolean;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  public_address_visibility: string;
  quartos: string;
  suites: string;
  banheiros: string;
  vagas: string;
  area_util: string;
  area_total: string;
  mobilia: string;
  regra_pet: boolean;
  andar: string;
  ano_construcao: string;
  preco: string;
  valor_locacao: string;
  condominio: string;
  iptu: string;
  seguro_incendio: string;
  taxa_de_servico: string;
  commission_percentage: string;
  descricao: string;
  imagem_principal: string;
  fotos: string[];
  video_imovel: string;
  detalhes_extras: string[];
  proximidades: string[];
  // New fields - Owner
  owner_name: string;
  owner_phone_residential: string;
  owner_phone_commercial: string;
  owner_cellphone: string;
  owner_email: string;
  owner_media_source: string;
  owner_notify_email: boolean;
  // Structure
  finalidade: string;
  // Location
  pais: string;
  // General data
  cadastrado_por: string;
  referencia_alternativa: string;
  condicao_pagamento: string;
  valor_itr: string;
  valor_seguro_fianca: string;
  // Property details
  padrao: string;
  posicao_localizacao: string;
  situacao_imovel: string;
  ocupacao: string;
  autorizado_comercializacao: boolean;
  exclusividade: boolean;
  ano_reforma: string;
  // Extras
  usou_fgts: boolean;
  aceita_financiamento: boolean;
  zoneamento: string;
  valor_venda_avaliado: string;
  valor_locacao_avaliado: string;
  comentarios_internos: string;
  marcadores: string[];
  // Key control
  local_chaves: string;
  // Publication
  anunciar: boolean;
  super_destaque: boolean;
  tour_virtual: string;
  descricao_site: string;
  // Signs
  placa_no_local: boolean;
  // Commissions
  tipo_comissao: string;
  corretor_id: string;
  comissao_venda: string;
  comissao_locacao: string;
  data_inicio_comissao: string;
  condicao_comercial: string;
  // Confidential
  codigo_iptu: string;
  numero_matricula: string;
  codigo_eletricidade: string;
  codigo_agua: string;
  status_descritivo: string;
  aprovacao_ambiental: string;
  projeto_aprovado: boolean;
  observacoes_documentacao: string;
}

const initialFormData: PropertyFormData = {
  title: '', tipo_de_imovel: 'Apartamento', tipo_de_negocio: 'Venda', status: 'active',
  destaque: false, endereco: '', numero: '', complemento: '', bairro: '', cidade: '',
   uf: '', cep: '', public_address_visibility: 'parcial', quartos: '', suites: '', banheiros: '', vagas: '', area_util: '',
  area_total: '', mobilia: '', regra_pet: false, andar: '', ano_construcao: '', preco: '',
  valor_locacao: '', condominio: '', iptu: '', seguro_incendio: '', taxa_de_servico: '', commission_percentage: '',
  descricao: '', imagem_principal: '', fotos: [], video_imovel: '', detalhes_extras: [],
  proximidades: [],
  owner_name: '', owner_phone_residential: '', owner_phone_commercial: '', owner_cellphone: '',
  owner_email: '', owner_media_source: '', owner_notify_email: false,
  finalidade: 'Residencial', pais: 'Brasil',
  cadastrado_por: '', referencia_alternativa: '', condicao_pagamento: '', valor_itr: '',
  valor_seguro_fianca: '',
  padrao: '', posicao_localizacao: '', situacao_imovel: '', ocupacao: '',
  autorizado_comercializacao: true, exclusividade: false, ano_reforma: '',
  usou_fgts: false, aceita_financiamento: true, zoneamento: '',
  valor_venda_avaliado: '', valor_locacao_avaliado: '', comentarios_internos: '', marcadores: [],
  local_chaves: '',
  anunciar: true, super_destaque: false, tour_virtual: '', descricao_site: '',
  placa_no_local: false,
  tipo_comissao: '', corretor_id: '', comissao_venda: '', comissao_locacao: '',
  data_inicio_comissao: '', condicao_comercial: '',
  codigo_iptu: '', numero_matricula: '', codigo_eletricidade: '', codigo_agua: '',
  status_descritivo: '', aprovacao_ambiental: '', projeto_aprovado: false,
  observacoes_documentacao: '',
};

const formatCurrencyDisplay = (value: string): string => {
  if (!value) return '';
  const numbers = value.replace(/\D/g, '');
  if (!numbers) return '';
  return Number(numbers).toLocaleString('pt-BR');
};

const parseCurrencyInput = (value: string): string => value.replace(/\D/g, '');

const DRAFT_KEY = 'property-form-draft';

const RequiredMark = () => <span className="ml-0.5 text-primary">*</span>;

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const isLandType = (value: string) => ['terreno', 'lote'].includes(normalize(value));
const isRentalType = (value: string) => ['aluguel', 'locacao', 'temporada', 'venda e aluguel'].includes(normalize(value));
const isSaleType = (value: string) => ['venda', 'venda e aluguel'].includes(normalize(value));

async function saveDraft(data: PropertyFormData, supabaseClient?: any) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  
  if (supabaseClient) {
    try {
      await supabaseClient.auth.updateUser({
        data: { property_draft: data }
      });
    } catch (error) {
      console.warn('Failed to sync draft to cloud', error);
    }
  }
}

function clearDraft(supabaseClient?: any) {
  localStorage.removeItem(DRAFT_KEY);
  if (supabaseClient) {
    supabaseClient.auth.updateUser({
      data: { property_draft: null }
    }).catch(() => {});
  }
}

export default function PropertyForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;
  const isMobile = useIsMobile();
  const { user, profile, isSuperAdmin } = useAuth();

  const [formData, setFormData] = useState<PropertyFormData>(() => {
    if (!id) {
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        const meta = user?.user_metadata?.property_draft;
        if (raw || meta) {
          const draftData = {
            ...initialFormData, 
            ...(meta ? meta : {}),
            ...(raw ? JSON.parse(raw) : {}) 
          };
          return {
            ...draftData,
            status: normalizePropertyStatus(draftData.status),
          };
        }
      } catch {
        // noop
      }
    }
    return initialFormData;
  });
  const [hasDraft] = useState(() => !id && (!!localStorage.getItem(DRAFT_KEY) || !!user?.user_metadata?.property_draft));
  const [activeTab, setActiveTab] = useState('owner');
  const [newTypeName, setNewTypeName] = useState('');
  const [showAddType, setShowAddType] = useState(false);

  const { data: property, isLoading: loadingProperty } = useProperty(id || null);
  const { data: propertyTypes = [] } = usePropertyTypes();
  const { data: features = [], isLoading: loadingFeatures } = usePropertyFeatures();
  const { data: proximities = [], isLoading: loadingProximities } = usePropertyProximities();
  const { data: users = [] } = useUsers();
  const createPropertyType = useCreatePropertyType();
  const createProperty = useCreateProperty();
  const updateProperty = useUpdateProperty();
  const createFeature = useCreatePropertyFeature();
  const createProximity = useCreatePropertyProximity();
  const seedFeatures = useSeedDefaultFeatures();
  const seedProximities = useSeedDefaultProximities();

  // Permission check: only admin or the creator can edit
  const isAdmin = profile?.role === 'admin' || isSuperAdmin;
  const isCreator = property && (property as any).cadastrado_por === user?.id;
  const canEdit = !isEditing || isAdmin || isCreator;

  useEffect(() => {
    if (isEditing && property && !loadingProperty && !canEdit) {
      toast.error('Você não tem permissão para editar este imóvel.');
      navigate('/properties');
    }
  }, [isEditing, property, loadingProperty, canEdit, navigate]);

  useEffect(() => {
    if (!loadingFeatures && features.length === 0) seedFeatures.mutate();
  }, [loadingFeatures, features.length]);

  useEffect(() => {
    if (!loadingProximities && proximities.length === 0) seedProximities.mutate();
  }, [loadingProximities, proximities.length]);

  // Auto-set cadastrado_por to current user for new properties
  useEffect(() => {
    if (!isEditing && user?.id && !formData.cadastrado_por) {
      set('cadastrado_por', user.id);
    }
  }, [isEditing, user?.id]);

  // Auto-save draft for new properties
  useEffect(() => {
    if (!isEditing) {
      const timer = setTimeout(() => saveDraft(formData, supabase), 2000); // 2s debounce for cloud sync
      return () => clearTimeout(timer);
    }
  }, [formData, isEditing]);

  useEffect(() => {
    if (property && isEditing) {
      const p = property as any;
      setFormData({
        title: p.title || '', tipo_de_imovel: p.tipo_de_imovel || 'Apartamento',
        tipo_de_negocio: p.tipo_de_negocio || 'Venda', status: normalizePropertyStatus(p.status),
        destaque: p.destaque || false, endereco: p.endereco || '', numero: p.numero || '',
        complemento: p.complemento || '', bairro: p.bairro || '', cidade: p.cidade || '',
        uf: p.uf || '', cep: p.cep || '', public_address_visibility: (p as any).public_address_visibility || 'parcial', quartos: p.quartos?.toString() || '',
        suites: p.suites?.toString() || '', banheiros: p.banheiros?.toString() || '',
        vagas: p.vagas?.toString() || '', area_util: p.area_util?.toString() || '',
        area_total: p.area_total?.toString() || '', mobilia: p.mobilia || '',
        regra_pet: p.regra_pet || false, andar: p.andar?.toString() || '',
        ano_construcao: p.ano_construcao?.toString() || '', preco: p.preco?.toString() || '',
        valor_locacao: p.valor_locacao?.toString() || '',
        condominio: p.condominio?.toString() || '', iptu: p.iptu?.toString() || '',
        seguro_incendio: p.seguro_incendio?.toString() || '',
        taxa_de_servico: p.taxa_de_servico?.toString() || '',
        commission_percentage: p.commission_percentage?.toString() || '',
        descricao: cleanPropertyDescription(p.descricao), imagem_principal: p.imagem_principal || '',
        fotos: (p.fotos as string[]) || [], video_imovel: p.video_imovel || '',
        detalhes_extras: (p.detalhes_extras as string[]) || [],
        proximidades: (p.proximidades as string[]) || [],
        owner_name: p.owner_name || '', owner_phone_residential: p.owner_phone_residential || '',
        owner_phone_commercial: p.owner_phone_commercial || '',
        owner_cellphone: p.owner_cellphone || '', owner_email: p.owner_email || '',
        owner_media_source: p.owner_media_source || '', owner_notify_email: p.owner_notify_email || false,
        finalidade: p.finalidade || 'Residencial', pais: p.pais || 'Brasil',
        cadastrado_por: p.cadastrado_por || '', referencia_alternativa: p.referencia_alternativa || '',
        condicao_pagamento: p.condicao_pagamento || '', valor_itr: p.valor_itr?.toString() || '',
        valor_seguro_fianca: p.valor_seguro_fianca?.toString() || '',
        padrao: p.padrao || '', posicao_localizacao: p.posicao_localizacao || '',
        situacao_imovel: p.situacao_imovel || '', ocupacao: p.ocupacao || '',
        autorizado_comercializacao: p.autorizado_comercializacao ?? true,
        exclusividade: p.exclusividade || false, ano_reforma: p.ano_reforma?.toString() || '',
        usou_fgts: p.usou_fgts || false, aceita_financiamento: p.aceita_financiamento ?? true,
        zoneamento: p.zoneamento || '', valor_venda_avaliado: p.valor_venda_avaliado?.toString() || '',
        valor_locacao_avaliado: p.valor_locacao_avaliado?.toString() || '',
        comentarios_internos: p.comentarios_internos || '', marcadores: p.marcadores || [],
        local_chaves: p.local_chaves || '', anunciar: p.anunciar ?? true,
        super_destaque: p.super_destaque || false, tour_virtual: p.tour_virtual || '',
        descricao_site: p.descricao_site || '', placa_no_local: p.placa_no_local || false,
        tipo_comissao: p.tipo_comissao || '', corretor_id: p.corretor_id || '',
        comissao_venda: p.comissao_venda?.toString() || '',
        comissao_locacao: p.comissao_locacao?.toString() || '',
        data_inicio_comissao: p.data_inicio_comissao || '', condicao_comercial: p.condicao_comercial || '',
        codigo_iptu: p.codigo_iptu || '', numero_matricula: p.numero_matricula || '',
        codigo_eletricidade: p.codigo_eletricidade || '', codigo_agua: p.codigo_agua || '',
        status_descritivo: p.status_descritivo || '', aprovacao_ambiental: p.aprovacao_ambiental || '',
        projeto_aprovado: p.projeto_aprovado || false, observacoes_documentacao: p.observacoes_documentacao || '',
      });
    }
  }, [property, isEditing]);

  const isLand = isLandType(formData.tipo_de_imovel);
  const isRental = isRentalType(formData.tipo_de_negocio);
  const isSale = isSaleType(formData.tipo_de_negocio) || !isRental;
  const hasOwnerContact = [
    formData.owner_cellphone,
    formData.owner_phone_residential,
    formData.owner_phone_commercial,
    formData.owner_email,
  ].some(value => value.trim() !== '');
  const isFormValid = [
    formData.owner_name.trim() !== '',
    hasOwnerContact,
    formData.title.trim() !== '',
    formData.tipo_de_imovel.trim() !== '',
    formData.tipo_de_negocio.trim() !== '',
    formData.public_address_visibility.trim() !== '',
    formData.cadastrado_por.trim() !== '',
    isSale ? formData.preco.trim() !== '' : true,
    isRental ? formData.valor_locacao.trim() !== '' : true,
    isLand ? formData.area_total.trim() !== '' : formData.quartos.trim() !== '',
    formData.imagem_principal.trim() !== '',
    formData.fotos.length > 0,
  ].every(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parseNum = (v: string) => v ? parseFloat(v.replace(/\D/g, '')) || null : null;
    const parseInt2 = (v: string) => v ? parseInt(v) || null : null;

    const propertyData: any = {
      title: formData.title || null, tipo_de_imovel: formData.tipo_de_imovel,
      tipo_de_negocio: formData.tipo_de_negocio, status: normalizePropertyStatus(formData.status),
      destaque: formData.destaque, endereco: formData.endereco || null,
      numero: formData.numero || null, complemento: formData.complemento || null,
      bairro: formData.bairro || null, cidade: formData.cidade || null,
      uf: formData.uf || null, cep: formData.cep || null,
      public_address_visibility: formData.public_address_visibility,
      quartos: parseInt2(formData.quartos), suites: parseInt2(formData.suites),
      banheiros: parseInt2(formData.banheiros), vagas: parseInt2(formData.vagas),
      area_util: parseNum(formData.area_util), area_total: parseNum(formData.area_total),
      mobilia: formData.mobilia || null, regra_pet: formData.regra_pet,
      andar: parseInt2(formData.andar), ano_construcao: parseInt2(formData.ano_construcao),
      preco: parseNum(formData.preco), valor_locacao: parseNum(formData.valor_locacao),
      condominio: parseNum(formData.condominio),
      iptu: parseNum(formData.iptu), seguro_incendio: parseNum(formData.seguro_incendio),
      taxa_de_servico: parseNum(formData.taxa_de_servico),
      commission_percentage: formData.commission_percentage ? parseFloat(formData.commission_percentage) : null,
      descricao: formData.descricao || null, imagem_principal: formData.imagem_principal || null,
      fotos: formData.fotos, video_imovel: formData.video_imovel || null,
      detalhes_extras: formData.detalhes_extras, proximidades: formData.proximidades,
      // New fields
      owner_name: formData.owner_name || null, owner_phone_residential: formData.owner_phone_residential || null,
      owner_phone_commercial: formData.owner_phone_commercial || null,
      owner_cellphone: formData.owner_cellphone || null, owner_email: formData.owner_email || null,
      owner_media_source: formData.owner_media_source || null, owner_notify_email: formData.owner_notify_email,
      finalidade: formData.finalidade || null, pais: formData.pais || null,
      cadastrado_por: formData.cadastrado_por || null, referencia_alternativa: formData.referencia_alternativa || null,
      condicao_pagamento: formData.condicao_pagamento || null,
      valor_itr: parseNum(formData.valor_itr), valor_seguro_fianca: parseNum(formData.valor_seguro_fianca),
      padrao: formData.padrao || null, posicao_localizacao: formData.posicao_localizacao || null,
      situacao_imovel: formData.situacao_imovel || null, ocupacao: formData.ocupacao || null,
      autorizado_comercializacao: formData.autorizado_comercializacao,
      exclusividade: formData.exclusividade, ano_reforma: parseInt2(formData.ano_reforma),
      usou_fgts: formData.usou_fgts, aceita_financiamento: formData.aceita_financiamento,
      zoneamento: formData.zoneamento || null, valor_venda_avaliado: parseNum(formData.valor_venda_avaliado),
      valor_locacao_avaliado: parseNum(formData.valor_locacao_avaliado),
      comentarios_internos: formData.comentarios_internos || null, marcadores: formData.marcadores,
      local_chaves: formData.local_chaves || null, anunciar: formData.anunciar,
      super_destaque: formData.super_destaque, tour_virtual: formData.tour_virtual || null,
      descricao_site: formData.descricao_site || null, placa_no_local: formData.placa_no_local,
      tipo_comissao: formData.tipo_comissao || null,
      corretor_id: formData.corretor_id || null,
      comissao_venda: formData.comissao_venda ? parseFloat(formData.comissao_venda) : null,
      comissao_locacao: formData.comissao_locacao ? parseFloat(formData.comissao_locacao) : null,
      data_inicio_comissao: formData.data_inicio_comissao || null,
      condicao_comercial: formData.condicao_comercial || null,
      codigo_iptu: formData.codigo_iptu || null, numero_matricula: formData.numero_matricula || null,
      codigo_eletricidade: formData.codigo_eletricidade || null, codigo_agua: formData.codigo_agua || null,
      status_descritivo: formData.status_descritivo || null, aprovacao_ambiental: formData.aprovacao_ambiental || null,
      projeto_aprovado: formData.projeto_aprovado, observacoes_documentacao: formData.observacoes_documentacao || null,
    };

    try {
      if (isEditing && id) {
        await updateProperty.mutateAsync({ id, ...propertyData });
      } else {
        await createProperty.mutateAsync(propertyData);
      }
      clearDraft(supabase);
      navigate('/properties');
    } catch (err) {
      // errors handled by mutation
    }
  };

  const handleImagesChange = (images: string[], mainImage: string) => {
    setFormData(prev => ({ ...prev, fotos: images, imagem_principal: mainImage }));
  };

  const handleAddPropertyType = async () => {
    if (!newTypeName.trim()) return;
    await createPropertyType.mutateAsync(newTypeName.trim());
    setNewTypeName('');
    setShowAddType(false);
  };

  if (isEditing && loadingProperty) {
    return (
      <AppLayout title="Carregando...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const tabs = [
    { value: 'owner', label: 'Proprietário', icon: User },
    { value: 'structure', label: 'Estrutura', icon: Home },
    { value: 'location', label: 'Localização', icon: MapPin },
    { value: 'characteristics', label: 'Características', icon: Settings2 },
    { value: 'extras', label: 'Extras', icon: Tag },
    { value: 'values', label: 'Valores', icon: DollarSign },
    { value: 'media', label: 'Fotos', icon: Image },
    { value: 'publication', label: 'Publicação', icon: Globe },
    { value: 'commissions', label: 'Comissões', icon: DollarSign },
    { value: 'confidential', label: 'Confidencial', icon: Lock },
    
  ];

  const set = (field: keyof PropertyFormData, value: any) => setFormData(prev => ({ ...prev, [field]: value }));

  return (
    <AppLayout title={isEditing ? 'Editar Imóvel' : 'Novo Imóvel'} disableMainScroll>
      <form onSubmit={handleSubmit} className="h-full min-h-0 flex flex-col gap-4 animate-in">
        {/* Top bar */}
        <div className="flex items-center justify-between flex-shrink-0">
          <Button type="button" variant="ghost" onClick={() => navigate('/properties')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
          <div className="flex items-center gap-2">
            {hasDraft && !isEditing && (
              <span className="text-xs text-muted-foreground mr-2">Rascunho restaurado</span>
            )}
            <Button type="button" variant="outline" onClick={() => { clearDraft(supabase); navigate('/properties'); }}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createProperty.isPending || updateProperty.isPending || !isFormValid}>
              {(createProperty.isPending || updateProperty.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Save className="h-4 w-4 mr-2" />
              {isEditing ? 'Salvar' : 'Cadastrar Imóvel'}
            </Button>
          </div>
        </div>

        {isEditing && property && (
          <div className="text-sm text-muted-foreground flex-shrink-0">Código: <span className="font-mono font-medium text-foreground">{property.code}</span></div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col gap-4">
          {isMobile ? (
            <Select value={activeTab} onValueChange={setActiveTab}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  <div className="flex items-center gap-2">
                    {(() => { const t = tabs.find(t => t.value === activeTab); return t ? <><t.icon className="h-4 w-4" /><span>{t.label}</span></> : null; })()}
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {tabs.map(tab => (
                  <SelectItem key={tab.value} value={tab.value}>
                    <div className="flex items-center gap-2">
                      <tab.icon className="h-4 w-4" />
                      <span>{tab.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <AnimatedTabNav tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} className="flex-shrink-0 w-fit" />
          )}

          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-6">
          {/* 1. Proprietário */}
          <TabsContent value="owner">
            <Card>
              <CardHeader><CardTitle className="text-lg">Proprietário</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome do Proprietário <RequiredMark /></Label>
                    <Input value={formData.owner_name} onChange={e => set('owner_name', e.target.value)} placeholder="Nome completo" />
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail</Label>
                    <Input type="email" value={formData.owner_email} onChange={e => set('owner_email', e.target.value)} placeholder="email@exemplo.com" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Tel. Residencial</Label>
                    <Input value={formData.owner_phone_residential} onChange={e => set('owner_phone_residential', e.target.value)} placeholder="(00) 0000-0000" />
                  </div>
                  <div className="space-y-2">
                    <Label>Tel. Comercial</Label>
                    <Input value={formData.owner_phone_commercial} onChange={e => set('owner_phone_commercial', e.target.value)} placeholder="(00) 0000-0000" />
                  </div>
                  <div className="space-y-2">
                    <Label>Celular</Label>
                    <Input value={formData.owner_cellphone} onChange={e => set('owner_cellphone', e.target.value)} placeholder="(00) 00000-0000" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Informe pelo menos um contato do proprietário <RequiredMark />: celular, telefone ou e-mail.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Mídia de Origem</Label>
                    <Select value={formData.owner_media_source} onValueChange={v => set('owner_media_source', v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="indicacao">Indicação</SelectItem>
                        <SelectItem value="site">Site</SelectItem>
                        <SelectItem value="redes_sociais">Redes Sociais</SelectItem>
                        <SelectItem value="placa">Placa</SelectItem>
                        <SelectItem value="portais">Portais Imobiliários</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label>Enviar avisos por e-mail para o proprietário</Label>
                    <Switch checked={formData.owner_notify_email} onCheckedChange={v => set('owner_notify_email', v)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 2. Estrutura */}
          <TabsContent value="structure">
            <Card>
              <CardHeader><CardTitle className="text-lg">Estrutura</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Título do Imóvel <RequiredMark /></Label>
                  <Input value={formData.title} onChange={e => set('title', e.target.value)} placeholder="Ex: Apartamento 3 quartos..." />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Finalidade</Label>
                    <Select value={formData.finalidade} onValueChange={v => set('finalidade', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Residencial">Residencial</SelectItem>
                        <SelectItem value="Comercial">Comercial</SelectItem>
                        <SelectItem value="Industrial">Industrial</SelectItem>
                        <SelectItem value="Rural">Rural</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Tipo de Imóvel <RequiredMark /></Label>
                      <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowAddType(!showAddType)}>
                        <Plus className="h-3 w-3 mr-1" /> Novo
                      </Button>
                    </div>
                    {showAddType && (
                      <div className="flex gap-2 mb-2">
                        <Input placeholder="Novo tipo..." value={newTypeName} onChange={e => setNewTypeName(e.target.value)} className="h-8 text-sm" />
                        <Button type="button" size="sm" className="h-8" onClick={handleAddPropertyType} disabled={createPropertyType.isPending}>OK</Button>
                      </div>
                    )}
                    <Select value={formData.tipo_de_imovel} onValueChange={v => set('tipo_de_imovel', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {propertyTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Modalidade <RequiredMark /></Label>
                    <Select value={formData.tipo_de_negocio} onValueChange={v => set('tipo_de_negocio', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Venda">Venda</SelectItem>
                        <SelectItem value="Aluguel">Locação</SelectItem>
                        <SelectItem value="Venda e Aluguel">Venda e Locação</SelectItem>
                        <SelectItem value="Temporada">Temporada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={formData.status} onValueChange={v => set('status', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Ativo</SelectItem>
                        <SelectItem value="inactive">Inativo</SelectItem>
                        <SelectItem value="sold">Vendido</SelectItem>
                        <SelectItem value="rented">Alugado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Referência Alternativa</Label>
                    <Input value={formData.referencia_alternativa} onChange={e => set('referencia_alternativa', e.target.value)} placeholder="Código externo..." />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 3. Localização */}
          <TabsContent value="location">
            <Card>
              <CardHeader><CardTitle className="text-lg">Localização do Imóvel</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>País</Label>
                    <Input value={formData.pais} onChange={e => set('pais', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Estado (UF)</Label>
                    <Input maxLength={2} value={formData.uf} onChange={e => set('uf', e.target.value.toUpperCase())} placeholder="SP" />
                  </div>
                  <div className="space-y-2">
                    <Label>Cidade</Label>
                    <Input value={formData.cidade} onChange={e => set('cidade', e.target.value)} placeholder="São Paulo" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Como o endereço aparece no site público? <RequiredMark /></Label>
                  <Select value={formData.public_address_visibility} onValueChange={v => set('public_address_visibility', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a visibilidade do endereço" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="completo">Completo - rua, número, bairro, cidade, UF e CEP</SelectItem>
                      <SelectItem value="parcial">Parcial - bairro, cidade e UF</SelectItem>
                      <SelectItem value="minimo">Mínimo - cidade e UF</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Essa configuração controla apenas o site público. No CRM, a equipe continua vendo o endereço cadastrado conforme suas permissões.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>CEP</Label>
                  <Input
                    value={formData.cep}
                    onChange={e => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 8);
                      const formatted = value.length > 5 ? `${value.slice(0, 5)}-${value.slice(5)}` : value;
                      set('cep', formatted);
                    }}
                    onBlur={async () => {
                      const cep = formData.cep.replace(/\D/g, '');
                      if (cep.length === 8) {
                        try {
                          const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                          const data = await res.json();
                          if (!data.erro) {
                            setFormData(prev => ({
                              ...prev,
                              endereco: data.logradouro || prev.endereco,
                              bairro: data.bairro || prev.bairro,
                              cidade: data.localidade || prev.cidade,
                              uf: data.uf || prev.uf,
                            }));
                          }
                        } catch {
                          // noop
                        }
                      }
                    }}
                    placeholder="00000-000"
                  />
                  <p className="text-xs text-muted-foreground">Digite o CEP para preencher automaticamente</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Logradouro</Label>
                    <Input value={formData.endereco} onChange={e => set('endereco', e.target.value)} placeholder="Rua, Avenida..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Número</Label>
                    <Input value={formData.numero} onChange={e => set('numero', e.target.value)} placeholder="123" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Complemento</Label>
                    <Input value={formData.complemento} onChange={e => set('complemento', e.target.value)} placeholder="Apto 101, Bloco A..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Bairro</Label>
                    <Input value={formData.bairro} onChange={e => set('bairro', e.target.value)} placeholder="Jardins" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 4. Características */}
          <TabsContent value="characteristics">
            <div className="space-y-4">
              {/* Dados gerais */}
              <Card>
                <CardHeader><CardTitle className="text-lg">Dados Gerais</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Responsável pela captação <RequiredMark /></Label>
                      <Select value={formData.cadastrado_por} onValueChange={v => set('cadastrado_por', v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o captador responsável" />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Current user first */}
                          {user?.id && (
                            <SelectItem key={user.id} value={user.id}>
                              {profile?.name || user.email} (Você)
                            </SelectItem>
                          )}
                          {users.filter(u => u.id !== user?.id).map(u => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name || u.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Condição de Pagamento (IPTU / ITR)</Label>
                      <Select value={formData.condicao_pagamento} onValueChange={v => set('condicao_pagamento', v)}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="iptu">IPTU</SelectItem>
                          <SelectItem value="itr">ITR</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Valor IPTU / ITR (R$)</Label>
                      <Input value={formatCurrencyDisplay(formData.valor_itr)} onChange={e => set('valor_itr', parseCurrencyInput(e.target.value))} placeholder="0" />
                    </div>
                    <div className="space-y-2">
                      <Label>Valor Seguro Fiança (R$)</Label>
                      <Input value={formatCurrencyDisplay(formData.valor_seguro_fianca)} onChange={e => set('valor_seguro_fianca', parseCurrencyInput(e.target.value))} placeholder="0" />
                    </div>
                    <div className="space-y-2">
                      <Label>Seguro Incêndio (R$)</Label>
                      <Input value={formatCurrencyDisplay(formData.seguro_incendio)} onChange={e => set('seguro_incendio', parseCurrencyInput(e.target.value))} placeholder="0" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Detalhes do imóvel */}
              <Card>
                <CardHeader><CardTitle className="text-lg">Detalhes do Imóvel</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {!isLand ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label>Quartos <RequiredMark /></Label>
                        <Select value={formData.quartos || undefined} onValueChange={v => set('quartos', v)}>
                          <SelectTrigger><SelectValue placeholder="Qtd" /></SelectTrigger>
                          <SelectContent>
                            {[0,1,2,3,4,5,6,7,8,9,10].map(n => <SelectItem key={n} value={String(n)}>{n === 10 ? '10+' : String(n)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Suítes</Label>
                        <Input type="number" value={formData.suites} onChange={e => set('suites', e.target.value)} placeholder="0" />
                      </div>
                      <div className="space-y-2">
                        <Label>Banheiros</Label>
                        <Input type="number" value={formData.banheiros} onChange={e => set('banheiros', e.target.value)} placeholder="0" />
                      </div>
                      <div className="space-y-2">
                        <Label>Vagas</Label>
                        <Input type="number" value={formData.vagas} onChange={e => set('vagas', e.target.value)} placeholder="0" />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
                      Terreno e lote usam metragem total como dado principal. Quartos, suítes, banheiros e vagas deixam de ser obrigatórios.
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Área Útil (m²)</Label>
                      <Input type="number" value={formData.area_util} onChange={e => set('area_util', e.target.value)} placeholder="120" />
                    </div>
                    <div className="space-y-2">
                      <Label>Área Total (m²){isLand && <RequiredMark />}</Label>
                      <Input type="number" value={formData.area_total} onChange={e => set('area_total', e.target.value)} placeholder="150" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Andar</Label>
                      <Input type="number" value={formData.andar} onChange={e => set('andar', e.target.value)} placeholder="5" />
                    </div>
                    <div className="space-y-2">
                      <Label>Ano de Construção</Label>
                      <Input type="number" value={formData.ano_construcao} onChange={e => set('ano_construcao', e.target.value)} placeholder="2020" />
                    </div>
                    <div className="space-y-2">
                      <Label>Ano de Reforma</Label>
                      <Input type="number" value={formData.ano_reforma} onChange={e => set('ano_reforma', e.target.value)} placeholder="2023" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Padrão</Label>
                      <Select value={formData.padrao} onValueChange={v => set('padrao', v)}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="popular">Popular</SelectItem>
                          <SelectItem value="medio">Médio</SelectItem>
                          <SelectItem value="alto">Alto</SelectItem>
                          <SelectItem value="luxo">Luxo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Posição da Localização</Label>
                      <Select value={formData.posicao_localizacao} onValueChange={v => set('posicao_localizacao', v)}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="frente">Frente</SelectItem>
                          <SelectItem value="fundos">Fundos</SelectItem>
                          <SelectItem value="lateral">Lateral</SelectItem>
                          <SelectItem value="esquina">Esquina</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Situação do Imóvel</Label>
                      <Select value={formData.situacao_imovel} onValueChange={v => set('situacao_imovel', v)}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="novo">Novo</SelectItem>
                          <SelectItem value="usado">Usado</SelectItem>
                          <SelectItem value="em_construcao">Em Construção</SelectItem>
                          <SelectItem value="planta">Na Planta</SelectItem>
                          <SelectItem value="reformado">Reformado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Ocupação</Label>
                      <Select value={formData.ocupacao} onValueChange={v => set('ocupacao', v)}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="desocupado">Desocupado</SelectItem>
                          <SelectItem value="ocupado_proprietario">Ocupado pelo proprietário</SelectItem>
                          <SelectItem value="ocupado_inquilino">Ocupado por inquilino</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Mobília</Label>
                    <Select value={formData.mobilia || undefined} onValueChange={v => set('mobilia', v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Mobiliado">Mobiliado</SelectItem>
                        <SelectItem value="Semi-mobiliado">Semi-mobiliado</SelectItem>
                        <SelectItem value="Sem mobília">Sem mobília</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <Label>Aceita Pet</Label>
                      <Switch checked={formData.regra_pet} onCheckedChange={v => set('regra_pet', v)} />
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <Label>Autorizado para Comercialização</Label>
                      <Switch checked={formData.autorizado_comercializacao} onCheckedChange={v => set('autorizado_comercializacao', v)} />
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <Label>Exclusividade</Label>
                      <Switch checked={formData.exclusividade} onCheckedChange={v => set('exclusividade', v)} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Extras do imóvel */}
              <Card>
                <CardHeader><CardTitle className="text-lg">Financiamento e Outros</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <Label>Usou FGTS nos últimos 3 anos?</Label>
                      <Switch checked={formData.usou_fgts} onCheckedChange={v => set('usou_fgts', v)} />
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <Label>Aceita Financiamento</Label>
                      <Switch checked={formData.aceita_financiamento} onCheckedChange={v => set('aceita_financiamento', v)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Zoneamento</Label>
                      <Input value={formData.zoneamento} onChange={e => set('zoneamento', e.target.value)} placeholder="ZR-1, ZC-2..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Valor de Venda Avaliado (R$)</Label>
                      <Input value={formatCurrencyDisplay(formData.valor_venda_avaliado)} onChange={e => set('valor_venda_avaliado', parseCurrencyInput(e.target.value))} placeholder="0" />
                    </div>
                    <div className="space-y-2">
                      <Label>Valor de Locação Avaliado (R$)</Label>
                      <Input value={formatCurrencyDisplay(formData.valor_locacao_avaliado)} onChange={e => set('valor_locacao_avaliado', parseCurrencyInput(e.target.value))} placeholder="0" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Comentários Internos</Label>
                    <Textarea value={formData.comentarios_internos} onChange={e => set('comentarios_internos', e.target.value)} placeholder="Observações internas..." rows={3} />
                  </div>
                  <div className="space-y-2">
                    <Label>Local das Chaves</Label>
                    <Input value={formData.local_chaves} onChange={e => set('local_chaves', e.target.value)} placeholder="Ex: Na portaria, no escritório..." />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* 5. Extras (Features/Proximities) */}
          <TabsContent value="extras">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <FeatureSelector
                    title="Detalhes Extras do Imóvel"
                    options={features.length > 0 ? features.map(f => f.name) : DEFAULT_FEATURES}
                    selected={formData.detalhes_extras}
                    onChange={selected => set('detalhes_extras', selected)}
                    allowAdd onAddNew={async (name) => { await createFeature.mutateAsync(name); }}
                    isLoading={loadingFeatures}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <FeatureSelector
                    title="Proximidades"
                    options={proximities.length > 0 ? proximities.map(p => p.name) : DEFAULT_PROXIMITIES}
                    selected={formData.proximidades}
                    onChange={selected => set('proximidades', selected)}
                    allowAdd onAddNew={async (name) => { await createProximity.mutateAsync(name); }}
                    isLoading={loadingProximities}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* 6. Valores */}
          <TabsContent value="values">
            <Card>
              <CardHeader><CardTitle className="text-lg">Valores</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {isSale && (
                    <div className="space-y-2">
                      <Label>Preço de venda (R$) <RequiredMark /></Label>
                      <Input value={formatCurrencyDisplay(formData.preco)} onChange={e => set('preco', parseCurrencyInput(e.target.value))} placeholder="500.000" className="text-lg font-semibold" />
                    </div>
                  )}
                  {isRental && (
                    <div className="space-y-2">
                      <Label>Valor de locação (R$) <RequiredMark /></Label>
                      <Input value={formatCurrencyDisplay(formData.valor_locacao)} onChange={e => set('valor_locacao', parseCurrencyInput(e.target.value))} placeholder="2.500" className="text-lg font-semibold" />
                      <p className="text-xs text-muted-foreground">Obrigatório para imóveis de locação ou temporada.</p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Condomínio (R$)</Label>
                    <Input value={formatCurrencyDisplay(formData.condominio)} onChange={e => set('condominio', parseCurrencyInput(e.target.value))} placeholder="800" />
                  </div>
                  <div className="space-y-2">
                    <Label>IPTU (R$)</Label>
                    <Input value={formatCurrencyDisplay(formData.iptu)} onChange={e => set('iptu', parseCurrencyInput(e.target.value))} placeholder="200" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Taxa de Serviço (R$)</Label>
                    <Input value={formatCurrencyDisplay(formData.taxa_de_servico)} onChange={e => set('taxa_de_servico', parseCurrencyInput(e.target.value))} placeholder="100" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 7. Fotos / Mídia */}
          <TabsContent value="media">
            <Card>
              <CardHeader><CardTitle className="text-lg">Fotos e Mídia</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <ImageUploader
                  images={formData.fotos}
                  mainImage={formData.imagem_principal}
                  onImagesChange={handleImagesChange}
                  organizationId={property?.organization_id}
                  propertyId={property?.id}
                />
                <Separator />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Link do Vídeo (YouTube)</Label>
                    <Input value={formData.video_imovel} onChange={e => set('video_imovel', e.target.value)} placeholder="https://youtube.com/watch?v=..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Tour Virtual (URL)</Label>
                    <Input value={formData.tour_virtual} onChange={e => set('tour_virtual', e.target.value)} placeholder="https://..." />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Descrição do Imóvel</Label>
                  <Textarea value={formData.descricao} onChange={e => set('descricao', e.target.value)} placeholder="Descreva o imóvel com detalhes..." rows={6} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 8. Publicação */}
          <TabsContent value="publication">
            <Card>
              <CardHeader><CardTitle className="text-lg">Publicação na Web</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label>Anunciar</Label>
                    <Switch checked={formData.anunciar} onCheckedChange={v => set('anunciar', v)} />
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label>Imóvel em Destaque</Label>
                    <Switch checked={formData.destaque} onCheckedChange={v => set('destaque', v)} />
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <Label>Super Destaque</Label>
                    <Switch checked={formData.super_destaque} onCheckedChange={v => set('super_destaque', v)} />
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <Label>Placa no Local</Label>
                  <Switch checked={formData.placa_no_local} onCheckedChange={v => set('placa_no_local', v)} />
                </div>
                <div className="space-y-2">
                  <Label>Descrição para o Site</Label>
                  <Textarea value={formData.descricao_site} onChange={e => set('descricao_site', e.target.value)} placeholder="Descrição otimizada para o site público..." rows={6} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 9. Comissões */}
          <TabsContent value="commissions">
            <Card>
              <CardHeader><CardTitle className="text-lg">Comissões e Condições</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo de Comissão</Label>
                    <Select value={formData.tipo_comissao} onValueChange={v => set('tipo_comissao', v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentual">Percentual</SelectItem>
                        <SelectItem value="valor_fixo">Valor Fixo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Corretor</Label>
                    <Select value={formData.corretor_id} onValueChange={v => set('corretor_id', v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Comissão Venda (%)</Label>
                    <Input type="number" step="0.1" value={formData.comissao_venda} onChange={e => set('comissao_venda', e.target.value)} placeholder="5" />
                  </div>
                  <div className="space-y-2">
                    <Label>Comissão Locação (%)</Label>
                    <Input type="number" step="0.1" value={formData.comissao_locacao} onChange={e => set('comissao_locacao', e.target.value)} placeholder="100" />
                  </div>
                  <div className="space-y-2">
                    <Label>Data de Início</Label>
                    <Input type="date" value={formData.data_inicio_comissao} onChange={e => set('data_inicio_comissao', e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Condição Comercial</Label>
                  <Textarea value={formData.condicao_comercial} onChange={e => set('condicao_comercial', e.target.value)} placeholder="Condições especiais..." rows={3} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 10. Confidencial */}
          <TabsContent value="confidential">
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Lock className="h-4 w-4" /> Dados Confidenciais</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Código IPTU</Label>
                    <Input value={formData.codigo_iptu} onChange={e => set('codigo_iptu', e.target.value)} placeholder="Código IPTU" />
                  </div>
                  <div className="space-y-2">
                    <Label>Número da Matrícula</Label>
                    <Input value={formData.numero_matricula} onChange={e => set('numero_matricula', e.target.value)} placeholder="Matrícula" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Código da Rede de Eletricidade</Label>
                    <Input value={formData.codigo_eletricidade} onChange={e => set('codigo_eletricidade', e.target.value)} placeholder="Código" />
                  </div>
                  <div className="space-y-2">
                    <Label>Código da Rede de Água</Label>
                    <Input value={formData.codigo_agua} onChange={e => set('codigo_agua', e.target.value)} placeholder="Código" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Status/Descritivo</Label>
                    <Input value={formData.status_descritivo} onChange={e => set('status_descritivo', e.target.value)} placeholder="Descrição" />
                  </div>
                  <div className="space-y-2">
                    <Label>Aprovação Órgão Ambiental</Label>
                    <Input value={formData.aprovacao_ambiental} onChange={e => set('aprovacao_ambiental', e.target.value)} placeholder="Detalhes" />
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <Label>Projeto Aprovado</Label>
                  <Switch checked={formData.projeto_aprovado} onCheckedChange={v => set('projeto_aprovado', v)} />
                </div>
                <div className="space-y-2">
                  <Label>Observações de Documentação</Label>
                  <Textarea value={formData.observacoes_documentacao} onChange={e => set('observacoes_documentacao', e.target.value)} placeholder="Observações sobre documentação..." rows={4} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          </div>
        </Tabs>
      </form>
    </AppLayout>
  );
}
