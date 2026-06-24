import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { 
  Building2, User, Globe, CheckCircle2, 
  Upload, Loader2, ChevronRight, ChevronLeft, Construction,
  Instagram, Facebook, Youtube, Linkedin, Mail, Scissors,
  CreditCard, ShieldCheck, ExternalLink, Sparkles, X
} from 'lucide-react';
import { toast } from 'sonner';
import { maskCNPJ, maskCPF, maskPhone } from '@/lib/masks';
import { fetchCNPJData } from '@/lib/cnpj';
import { useSystemSettings } from '@/hooks/use-system-settings';
import { useTheme } from 'next-themes';
import { ImageCropper } from '@/components/ui/image-cropper';

const STEPS = [
  { id: 1, title: 'Perfil' },
  { id: 2, title: 'Dados Pessoais' },
  { id: 3, title: 'Organização' },
  { id: 4, title: 'Personalização' },
  { id: 5, title: 'Redes Sociais' },
  { id: 6, title: 'Plano' },
  { id: 7, title: 'Termos' },
  { id: 8, title: 'Confirmação' },
];

const LEGAL_VERSION = '2026-06-06';

type OnboardingPlan = {
  id: string;
  name: string;
  price: number;
  billing_cycle: string | null;
  description: string | null;
  trial_enabled?: boolean | null;
  trial_days?: number | null;
};

const fallbackPlans: OnboardingPlan[] = [
  {
    id: 'enterprise-fallback',
    name: 'Enterprise',
    price: 197,
    billing_cycle: 'monthly',
    description: 'Plano intermediario com 7 dias de teste.',
    trial_enabled: true,
    trial_days: 7,
  },
  {
    id: 'master-fallback',
    name: 'Master',
    price: 497,
    billing_cycle: 'monthly',
    description: 'Plano completo com liberacao apos pagamento.',
    trial_enabled: false,
    trial_days: 0,
  },
];

type LegalModalSection = {
  title: string;
  eyebrow: string;
  items: string[];
};

function buildLegalSections(
  type: 'privacy' | 'terms',
  form: Record<string, any>,
  selectedPlan: OnboardingPlan,
): LegalModalSection[] {
  const planLine = `${selectedPlan?.name || 'Plano Vimob'} - ${Number(selectedPlan?.price || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })}`;

  if (type === 'terms') {
    return [
      {
        eyebrow: 'Uso da plataforma',
        title: 'Aceite, conta e responsabilidade',
        items: [
          'Ao criar o board, acessar o Vimob ou aceitar estes Termos, voce confirma que pode representar a organizacao informada e contratar/usar a plataforma em nome dela.',
          `A conta sera criada para ${form.company_name || 'a organizacao informada'}, com ${form.responsible_name || 'o responsavel informado'} como administrador inicial.`,
          'O administrador responde pelos usuarios convidados, permissoes concedidas, dados inseridos, integracoes ativadas, automacoes configuradas e pelo uso correto das credenciais.',
        ],
      },
      {
        eyebrow: 'Plano escolhido',
        title: 'Planos, teste e pagamento',
        items: [
          `O plano selecionado no onboarding e ${planLine}.`,
          'O plano Enterprise de R$197 pode iniciar com 7 dias de teste quando essa condicao aparecer no momento da contratacao. Apos o teste, a continuidade depende da regularizacao em Faturamento.',
          'O plano Master de R$497 exige pagamento para liberacao completa, porque inclui recursos que nao entram no teste gratuito.',
          'A inadimplencia, fim de trial sem pagamento, chargeback ou falha de cobranca pode colocar o board em pagamento pendente e restringir o acesso as telas necessarias para regularizacao.',
        ],
      },
      {
        eyebrow: 'Conduta',
        title: 'Uso permitido e limites',
        items: [
          'O Vimob deve ser usado de forma licita, respeitando LGPD, regras de comunicacao, propriedade intelectual, politicas antispam, normas profissionais e direitos de terceiros.',
          'E proibido tentar acessar dados de outra organizacao, burlar limites, explorar falhas, realizar engenharia reversa, automatizar abuso, sobrecarregar sistemas ou usar a plataforma para fraude/conteudo ilegal.',
          'A Vimob pode suspender, limitar ou bloquear acessos quando houver risco de seguranca, violacao destes Termos, uso abusivo, exigencia legal ou inadimplencia.',
        ],
      },
      {
        eyebrow: 'Operacao',
        title: 'Recursos, integracoes e disponibilidade',
        items: [
          'A plataforma pode operar CRM, funis, leads, contatos, WhatsApp, agenda, automacoes, financeiro, site publico, IA, campanhas, relatorios e modulos contratados.',
          'Integracoes como WhatsApp, Meta, meios de pagamento, mapas, e-mail, telefonia, IA e outros fornecedores dependem de disponibilidade, credenciais, limites e politicas desses terceiros.',
          'Podem ocorrer indisponibilidades por manutencao, atualizacoes, incidentes, internet, provedores externos ou fatores fora do controle razoavel da Vimob.',
        ],
      },
      {
        eyebrow: 'Encerramento',
        title: 'Dados, propriedade e cancelamento',
        items: [
          'A plataforma, marca, codigo, fluxos, telas, documentacao e recursos da Vimob pertencem a Vimob ou seus licenciantes.',
          'Os dados da organizacao, leads, clientes, contatos, mensagens, arquivos e configuracoes pertencem ou sao de responsabilidade da empresa cliente, respeitado o tratamento necessario para operar o servico.',
          'Em cancelamento, inadimplencia prolongada ou encerramento, o acesso pode ser bloqueado e os dados podem ser retidos ou excluidos conforme contrato, politica de retencao e obrigacoes legais.',
        ],
      },
    ];
  }

  return [
    {
      eyebrow: 'Dados do onboarding',
      title: 'Informacoes que coletamos para criar o board',
      items: [
        `Perfil de atuacao: ${form.segment || 'nao informado'}.`,
        `Responsavel: ${form.responsible_name || 'nao informado'}, e-mail ${form.responsible_email || 'nao informado'}, WhatsApp ${form.responsible_phone || 'nao informado'}${form.responsible_cpf ? `, CPF ${form.responsible_cpf}` : ''}.`,
        `Organizacao: ${form.company_name || 'nao informada'}${form.cnpj ? `, CNPJ ${form.cnpj}` : ''}${form.creci ? `, CRECI ${form.creci}` : ''}.`,
        'Tambem podemos tratar telefone, e-mail, endereco, cidade, bairro, numero, complemento, logotipo, titulo de site, dominio proprio e redes sociais informadas no onboarding.',
      ],
    },
    {
      eyebrow: 'Uso dos dados',
      title: 'Por que esses dados entram no sistema',
      items: [
        'Usamos os dados para criar a organizacao, configurar o administrador, liberar modulos, registrar o aceite legal, operar o trial, gerar cobranca e prestar suporte.',
        'WhatsApp e telefone sao usados para identificacao, suporte, notificacoes operacionais, contato sobre onboarding, faturamento, seguranca e integracoes de atendimento quando ativadas.',
        'Dados de plano, valor, status de assinatura, trial, pagamento e faturamento sao usados para liberar ou restringir recursos conforme a contratacao.',
      ],
    },
    {
      eyebrow: 'Dados dentro da plataforma',
      title: 'Informacoes que voce e sua equipe podem inserir depois',
      items: [
        'A organizacao pode inserir leads, clientes, contatos, mensagens, anotacoes, tarefas, agenda, arquivos, imoveis, propostas, contratos, funis, automacoes, relatorios e configuracoes.',
        'Esses dados sao tratados para executar as funcionalidades contratadas, sincronizar integracoes, distribuir atendimento, registrar historico e gerar indicadores.',
        'A empresa cliente e controladora dos dados que insere sobre seus clientes/leads; a Vimob atua principalmente como operadora, seguindo as instrucoes e configuracoes da organizacao.',
      ],
    },
    {
      eyebrow: 'Seguranca',
      title: 'Protecao, logs e compartilhamentos',
      items: [
        'Podemos registrar IP, navegador, dispositivo, data/hora de acesso, eventos de seguranca, logs de uso e auditoria para proteger contas e investigar incidentes.',
        'Compartilhamos dados com fornecedores necessarios para infraestrutura, banco de dados, autenticacao, armazenamento, pagamentos, mensageria, suporte, analiticos e integracoes ativadas.',
        'Nao vendemos dados pessoais. Dados agregados ou anonimizados podem ser usados para melhoria de produto, metricas e estabilidade.',
      ],
    },
    {
      eyebrow: 'LGPD',
      title: 'Direitos, retencao e contato',
      items: [
        'Titulares podem solicitar confirmacao de tratamento, acesso, correcao, portabilidade, anonimizacao, eliminacao, informacoes sobre compartilhamento e revisao de decisoes automatizadas, conforme a LGPD.',
        'Mantemos dados pelo tempo necessario para prestar o servico, cumprir obrigacoes legais, resolver disputas, prevenir fraude, preservar registros e executar o contrato.',
        'Solicitacoes de privacidade devem ser enviadas ao canal oficial da Vimob ou a empresa cliente quando ela for a controladora direta do relacionamento com o titular.',
      ],
    },
  ];
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const { data: systemSettings, isLoading: settingsLoading } = useSystemSettings();
  const { resolvedTheme } = useTheme();

  const logoUrl = useMemo(() => {
    if (!systemSettings) return null;
    return resolvedTheme === 'dark'
      ? systemSettings.logo_url_dark || systemSettings.logo_url_light
      : systemSettings.logo_url_light || systemSettings.logo_url_dark;
  }, [systemSettings, resolvedTheme]);

  const loginBgUrl = useMemo(() => {
    if (!systemSettings) return null;
    return systemSettings.login_bg_url || null;
  }, [systemSettings]);

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [pendingLogoUrl, setPendingLogoUrl] = useState<string | null>(null);
  const [bgLoaded, setBgLoaded] = useState(false);
  const [plans, setPlans] = useState<OnboardingPlan[]>(fallbackPlans);
  const [plansLoading, setPlansLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState('enterprise-fallback');
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [legalDialog, setLegalDialog] = useState<'privacy' | 'terms' | null>(null);
  const [legalPageIndex, setLegalPageIndex] = useState(0);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [requiresPayment, setRequiresPayment] = useState(false);

  const [form, setForm] = useState({
    segment: 'corretor',
    company_name: '',
    cnpj: '',
    company_address: '',
    company_city: '',
    company_neighborhood: '',
    company_number: '',
    company_complement: '',
    company_phone: '',
    company_whatsapp: '',
    company_email: '',
    responsible_name: user?.user_metadata?.full_name || '',
    responsible_email: user?.email || '',
    responsible_cpf: '',
    responsible_phone: '',
    logo_url: '',
    primary_color: '#3b82f6',
    site_title: '',
    custom_domain: '',
    instagram: '',
    facebook: '',
    youtube: '',
    linkedin: '',
    creci: '',
  });

  useEffect(() => {
    if (profile?.organization_id) {
      navigate('/');
    }
  }, [profile, navigate]);

  // Optimized background image loading
  useEffect(() => {
    if (!loginBgUrl) return;
    const img = new Image();
    const optimizedUrl = loginBgUrl.includes('supabase.co') 
      ? `${loginBgUrl}?width=800&quality=60&format=webp`
      : loginBgUrl;
    img.src = optimizedUrl;
    img.onload = () => setBgLoaded(true);
  }, [loginBgUrl]);

  useEffect(() => {
    const fetchPlans = async () => {
      setPlansLoading(true);
      try {
        const { data, error } = await (supabase as any)
          .from('admin_subscription_plans')
          .select('id, name, price, billing_cycle, description, trial_enabled, trial_days')
          .eq('is_active', true)
          .in('name', ['Enterprise', 'Master'])
          .order('price', { ascending: true });

        if (error) throw error;

        const activePlans = (data || []) as OnboardingPlan[];
        const normalizedPlans = activePlans.length >= 2 ? activePlans : fallbackPlans;
        setPlans(normalizedPlans);
        setSelectedPlanId((current) => {
          if (normalizedPlans.some((plan) => plan.id === current)) return current;
          return normalizedPlans[0]?.id || 'enterprise-fallback';
        });
      } catch (error) {
        console.warn('[Onboarding] Could not load plans, using fallback:', error);
        setPlans(fallbackPlans);
        setSelectedPlanId('enterprise-fallback');
      } finally {
        setPlansLoading(false);
      }
    };

    fetchPlans();
  }, []);

  const updateField = (field: string, value: any) => setForm((prev) => ({ ...prev, [field]: value }));

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) || plans[0] || fallbackPlans[0];
  const selectedPlanHasTrial = Boolean(selectedPlan?.trial_enabled) && Number(selectedPlan?.trial_days || 0) > 0;
  const selectedPlanPrice = Number(selectedPlan?.price || 0);
  const responsiblePhoneDigits = form.responsible_phone.replace(/\D/g, '');
  const legalSections = legalDialog ? buildLegalSections(legalDialog, form, selectedPlan) : [];
  const currentLegalSection = legalSections[legalPageIndex] || legalSections[0];

  const openLegalDialog = (type: 'privacy' | 'terms') => {
    setLegalDialog(type);
    setLegalPageIndex(0);
  };

  const closeLegalDialog = () => {
    setLegalDialog(null);
    setLegalPageIndex(0);
  };

  const finishLegalDialog = () => {
    if (legalDialog === 'privacy') setAcceptedPrivacy(true);
    if (legalDialog === 'terms') setAcceptedTerms(true);
    closeLegalDialog();
  };

  const handleFileUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setPendingLogoUrl(reader.result as string);
      setCropDialogOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const onCropComplete = async (blob: Blob) => {
    setCropDialogOpen(false);
    setLogoUploading(true);
    try {
      const uniqueId = user?.id || crypto.randomUUID();
      const path = `onboarding/${uniqueId}/logo_${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage.from('logos').upload(path, blob);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path);
      updateField('logo_url', publicUrl);
      toast.success('Logo enviado e ajustado com sucesso!');
    } catch (err: any) {
      toast.error('Erro ao enviar arquivo: ' + err.message);
    } finally {
      setLogoUploading(false);
      setPendingLogoUrl(null);
    }
  };

  const handleCNPJLookup = async () => {
    const cleanCNPJ = form.cnpj.replace(/\D/g, '');
    if (cleanCNPJ.length !== 14) return;
    setLoading(true);
    const data = await fetchCNPJData(cleanCNPJ);
    if (data) {
      setForm((prev) => ({
        ...prev,
        company_name: data.nome_fantasia || data.razao_social,
        company_address: data.logradouro || '',
        company_city: data.municipio && data.uf ? `${data.municipio} - ${data.uf}` : '',
        company_neighborhood: data.bairro || '',
        company_number: data.numero || '',
        company_email: data.email || '',
        company_phone: data.ddd_telefone_1 || '',
      }));
      toast.success('Dados encontrados!');
    } else {
      toast.error('CNPJ não encontrado');
    }
    setLoading(false);
  };

  const handleNext = () => {
    if (step === 2 && (!form.responsible_name || !form.responsible_email || responsiblePhoneDigits.length < 10)) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }
    if (step === 3 && !form.company_name) {
      toast.error('Nome da empresa/profissional é obrigatório');
      return;
    }
    if (step === 6 && !selectedPlanId) {
      toast.error('Escolha um plano para continuar');
      return;
    }
    if (step === 7 && (!acceptedPrivacy || !acceptedTerms)) {
      toast.error('Aceite a Politica de Privacidade e os Termos de Uso para enviar');
      return;
    }
    setStep((prev) => prev + 1);
  };

  const handleBack = () => setStep((prev) => prev - 1);

  const handleSubmit = async () => {
    if (responsiblePhoneDigits.length < 10) {
      toast.error('WhatsApp é obrigatório');
      setStep(2);
      return;
    }

    if (!acceptedPrivacy || !acceptedTerms) {
      toast.error('Aceite a Politica de Privacidade e os Termos de Uso para enviar');
      setStep(7);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('submit-onboarding', {
        body: {
          ...form,
          selected_plan_id: selectedPlan?.id,
          selected_plan_name: selectedPlan?.name,
          confirmed_value: selectedPlanPrice,
          billing_cycle: selectedPlan?.billing_cycle || 'monthly',
          privacy_policy_accepted: acceptedPrivacy,
          terms_accepted: acceptedTerms,
          privacy_policy_version: LEGAL_VERSION,
          terms_version: LEGAL_VERSION,
          legal_accepted_at: new Date().toISOString(),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPaymentUrl(data?.paymentUrl || null);
      setRequiresPayment(Boolean(data?.requires_payment));
      if (user) await refreshProfile();
      setSubmitted(true);
      toast.success(data?.requires_payment ? 'Ambiente criado. Pagamento pendente.' : 'Ambiente criado com sucesso!');
      if (data?.whatsapp_notification?.success === false) {
        toast.warning('Ambiente criado, mas o WhatsApp com login e senha nao foi enviado.');
      }
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="dark min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
        {/* Mobile background: full screen background on mobile */}
        <div className="lg:hidden absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
          {loginBgUrl ? (
            <div className="relative w-full h-full">
              <img 
                src={loginBgUrl.includes('supabase.co') ? `${loginBgUrl}?width=800&quality=60&format=webp` : loginBgUrl}
                alt=""
                className={`w-full h-full object-cover object-center transition-opacity duration-700 ${bgLoaded ? 'opacity-100' : 'opacity-0'}`}
                loading="eager"
              />
              <div className="absolute inset-x-0 bottom-0 h-[80%] bg-gradient-to-t from-background via-background/90 to-transparent" />
            </div>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/10 via-background to-background" />
          )}
        </div>

        <Card className="max-w-md w-full border-border/50 overflow-hidden relative z-10">
          <div className="h-2 bg-green-500" />
          <CardContent className="pt-12 pb-12 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/20 mb-4">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-2xl font-bold">{requiresPayment ? 'Ambiente criado!' : 'Acesso liberado!'}</h2>
            <p className="text-muted-foreground">
              {requiresPayment
                ? 'Seu board foi criado. Finalize o pagamento para liberar o plano Master.'
                : 'Seu board foi criado com 7 dias de teste. Voce recebera lembretes antes do fim do periodo.'}
            </p>
            {requiresPayment && paymentUrl ? (
              <Button className="mt-4 w-full gap-2" asChild>
                <a href={paymentUrl} target="_blank" rel="noreferrer">
                  Ir para pagamento <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            ) : requiresPayment ? (
              <Button className="mt-4 w-full" onClick={() => navigate('/settings?tab=subscription')}>
                Ir para faturamento
              </Button>
            ) : (
              <Button className="mt-4 w-full" onClick={() => navigate('/')}>Entrar no Vimob</Button>
            )}
          </CardContent>
        </Card>

        {/* Desktop background right column */}
        <div className="hidden lg:block absolute inset-y-0 right-0 w-[50%] overflow-hidden pointer-events-none">
          {loginBgUrl ? (
            <div className="relative w-full h-full">
              <img 
                src={loginBgUrl}
                alt=""
                className={`w-full h-full object-cover transition-opacity duration-1000 ${bgLoaded ? 'opacity-100' : 'opacity-0'}`}
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-background via-background/20 to-transparent" />
            </div>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/10 via-background to-primary/5" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="dark min-h-screen flex flex-col lg:flex-row bg-background relative overflow-x-hidden">
      {/* Mobile background: full screen background on mobile */}
      <div className="lg:hidden absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
        {loginBgUrl ? (
          <div className="relative w-full h-full">
            <img 
              src={loginBgUrl.includes('supabase.co') ? `${loginBgUrl}?width=800&quality=60&format=webp` : loginBgUrl}
              alt=""
              className={`w-full h-full object-cover object-center transition-opacity duration-700 ${bgLoaded ? 'opacity-100' : 'opacity-0'}`}
              loading="eager"
            />
            {/* Vertical gradient similar to desktop horizontal gradient */}
            <div className="absolute inset-x-0 bottom-0 h-[80%] bg-gradient-to-t from-background via-background/90 to-transparent" />
          </div>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/10 via-background to-background" />
        )}
      </div>

      {/* Onboarding form container */}
      <div className="w-full lg:w-[480px] xl:w-[540px] flex flex-col items-center justify-center px-6 py-8 lg:py-10 flex-shrink-0 mx-auto lg:ml-[100px] xl:ml-[100px] flex-1 lg:flex-none relative z-10">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-6 min-h-[56px] justify-center">
            {settingsLoading ? (
              <div className="h-10 w-32 bg-muted animate-pulse rounded-lg" />
            ) : logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo"
                width="160"
                height="56"
                className="h-14 w-auto mb-2"
                decoding="async"
              />
            ) : null}
            <h1 className="text-2xl font-bold tracking-tight mt-4">Onboarding</h1>
            <div className="w-full mt-4 space-y-2">
              <div className="flex justify-between items-center text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                <span>Passo {step} de {STEPS.length}</span>
                <span>{STEPS[step-1].title}</span>
              </div>
              <Progress value={(step / STEPS.length) * 100} className="w-full h-1.5" />
            </div>
          </div>

          <div className="space-y-6">
            {step === 1 && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold">Como você atua no mercado imobiliário?</h2>
                  <p className="text-xs text-muted-foreground">Escolha o perfil que melhor descreve sua atuação.</p>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { id: 'corretor', label: 'Corretor Autônomo', desc: 'Trabalho de forma independente', icon: User },
                    { id: 'imobiliaria', label: 'Imobiliária / Agência', desc: 'Tenho ou gerencio uma imobiliária', icon: Building2 },
                    { id: 'incorporadora', label: 'Incorporadora / Construtora', desc: 'Desenvolvo ou vendo empreendimentos', icon: Construction },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => updateField('segment', item.id)}
                      className={`group relative flex items-center p-4 border rounded-xl text-left transition-all hover:border-primary/50 ${
                        form.segment === item.id ? 'border-primary bg-primary/5' : 'border-border bg-card shadow-sm'
                      }`}
                    >
                      <div className={`mr-4 p-2.5 rounded-lg transition-colors ${
                        form.segment === item.id ? 'bg-primary text-primary-foreground' : 'bg-muted group-hover:bg-accent-foreground/10'
                      }`}>
                        <item.icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-sm">{item.label}</h3>
                        <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                      </div>
                      {form.segment === item.id && (
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold">Seus dados pessoais</h2>
                  <p className="text-xs text-muted-foreground">Precisamos saber quem está no comando.</p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="responsible_name" className="text-xs">Nome Completo *</Label>
                    <Input id="responsible_name" required value={form.responsible_name} onChange={(e) => updateField('responsible_name', e.target.value)} placeholder="Seu nome" className="h-10 text-sm rounded-lg" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="responsible_email" className="text-xs">E-mail (Login) *</Label>
                    <Input id="responsible_email" type="email" required value={form.responsible_email} onChange={(e) => updateField('responsible_email', e.target.value)} disabled={!!user} className="h-10 text-sm rounded-lg" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="responsible_cpf" className="text-xs">CPF</Label>
                      <Input id="responsible_cpf" value={form.responsible_cpf} onChange={(e) => updateField('responsible_cpf', maskCPF(e.target.value))} placeholder="000.000.000-00" className="h-10 text-sm rounded-lg" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="responsible_phone" className="text-xs">WhatsApp *</Label>
                      <Input
                        id="responsible_phone"
                        required
                        inputMode="tel"
                        aria-required="true"
                        value={form.responsible_phone}
                        onChange={(e) => updateField('responsible_phone', maskPhone(e.target.value))}
                        placeholder="(00) 00000-0000"
                        className="h-10 text-sm rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold">Dados da organização</h2>
                  <p className="text-xs text-muted-foreground">
                    {form.segment === 'corretor' 
                      ? 'A sua conta será criada no seu nome.'
                      : 'Preencha os dados oficiais da sua empresa.'}
                  </p>
                </div>
                <div className="space-y-4">
                  {form.segment !== 'corretor' && (
                    <div className="space-y-1.5">
                      <Label htmlFor="cnpj" className="text-xs">CNPJ</Label>
                      <div className="flex gap-2">
                        <Input id="cnpj" value={form.cnpj} onChange={(e) => updateField('cnpj', maskCNPJ(e.target.value))} placeholder="00.000.000/0000-00" className="h-10 text-sm rounded-lg" />
                        <Button type="button" variant="outline" size="sm" onClick={handleCNPJLookup} disabled={loading} className="h-10">
                          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="company_name" className="text-xs">{form.segment === 'corretor' ? 'Nome Profissional *' : 'Nome da Empresa *'}</Label>
                    <Input id="company_name" required value={form.company_name} onChange={(e) => updateField('company_name', e.target.value)} placeholder="Ex: Imobiliária Silva ou João Corretor" className="h-10 text-sm rounded-lg" />
                  </div>
                  {form.segment === 'corretor' ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="creci" className="text-xs">CRECI</Label>
                      <Input id="creci" value={form.creci} onChange={(e) => updateField('creci', e.target.value)} placeholder="12345-F" className="h-10 text-sm rounded-lg" />
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="company_phone" className="text-xs">Telefone</Label>
                          <Input id="company_phone" value={form.company_phone} onChange={(e) => updateField('company_phone', maskPhone(e.target.value))} placeholder="(00) 0000-0000" className="h-10 text-sm rounded-lg" />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="company_email" className="text-xs">E-mail</Label>
                          <Input id="company_email" type="email" value={form.company_email} onChange={(e) => updateField('company_email', e.target.value)} placeholder="contato@empresa.com" className="h-10 text-sm rounded-lg" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="company_address" className="text-xs">Endereço Completo</Label>
                        <Input id="company_address" value={form.company_address} onChange={(e) => updateField('company_address', e.target.value)} placeholder="Rua, Número, Cidade - UF" className="h-10 text-sm rounded-lg" />
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold">Personalização</h2>
                  <p className="text-xs text-muted-foreground">Configure sua identidade visual.</p>
                </div>
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-xs">Logotipo (PNG/JPG)</Label>
                    <div className="flex items-center gap-4">
                      <div className="h-20 w-20 rounded-xl border-2 border-dashed flex items-center justify-center bg-muted/30 overflow-hidden relative group">
                        {form.logo_url ? (
                          <img src={form.logo_url} className="w-full h-full object-contain p-2" alt="Preview logo" />
                        ) : (
                          <Upload className="h-6 w-6 text-muted-foreground" />
                        )}
                        <input 
                          id="logo-upload"
                          type="file" 
                          className="absolute inset-0 opacity-0 cursor-pointer" 
                          accept="image/*" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file);
                            e.target.value = '';
                          }} 
                        />
                        {logoUploading && <div className="absolute inset-0 bg-background/80 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>}
                      </div>
                      <div className="flex-1 space-y-2">
                        <p className="text-[10px] text-muted-foreground">Clique para enviar logotipo.</p>
                        <div className="flex flex-col gap-1.5">
                          <Button size="sm" variant="outline" type="button" onClick={() => document.getElementById('logo-upload')?.click()} className="h-8 text-xs">Escolher arquivo</Button>
                          {form.logo_url && (
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              type="button" 
                              className="h-8 gap-2 text-xs"
                              onClick={() => {
                                setPendingLogoUrl(form.logo_url);
                                setCropDialogOpen(true);
                              }}
                            >
                              <Scissors className="h-3 w-3" />
                              Ajustar atual
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    {cropDialogOpen && pendingLogoUrl && (
                      <ImageCropper 
                        imageSrc={pendingLogoUrl}
                        onCropComplete={onCropComplete}
                        onCancel={() => {
                          setCropDialogOpen(false);
                          setPendingLogoUrl(null);
                        }}
                      />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="site_title" className="text-xs">Título do site</Label>
                    <Input id="site_title" value={form.site_title} onChange={(e) => updateField('site_title', e.target.value)} placeholder="Ex: Melhores Imóveis em São Paulo" className="h-10 text-sm rounded-lg" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="custom_domain" className="text-xs">Domínio próprio</Label>
                    <Input id="custom_domain" value={form.custom_domain} onChange={(e) => updateField('custom_domain', e.target.value)} placeholder="www.meusite.com.br" className="h-10 text-sm rounded-lg" />
                  </div>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold">Redes Sociais</h2>
                  <p className="text-xs text-muted-foreground">Conecte-se com seus clientes.</p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2 text-xs"><Instagram className="h-3.5 w-3.5" /> Instagram</Label>
                    <Input value={form.instagram} onChange={(e) => updateField('instagram', e.target.value)} placeholder="@seuperfil" className="h-10 text-sm rounded-lg" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2 text-xs"><Facebook className="h-3.5 w-3.5" /> Facebook</Label>
                    <Input value={form.facebook} onChange={(e) => updateField('facebook', e.target.value)} placeholder="facebook.com/suapagina" className="h-10 text-sm rounded-lg" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2 text-xs"><Youtube className="h-3.5 w-3.5" /> YouTube</Label>
                    <Input value={form.youtube} onChange={(e) => updateField('youtube', e.target.value)} placeholder="youtube.com/@seu-canal" className="h-10 text-sm rounded-lg" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2 text-xs"><Linkedin className="h-3.5 w-3.5" /> LinkedIn</Label>
                    <Input value={form.linkedin} onChange={(e) => updateField('linkedin', e.target.value)} placeholder="linkedin.com/in/perfil" className="h-10 text-sm rounded-lg" />
                  </div>
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold">Escolha seu plano</h2>
                  <p className="text-xs text-muted-foreground">O plano define a liberacao inicial do seu board.</p>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {plans.map((plan) => {
                    const isSelected = selectedPlanId === plan.id;
                    const hasTrial = Boolean(plan.trial_enabled) && Number(plan.trial_days || 0) > 0;
                    const isMaster = plan.name.toLowerCase().includes('master');
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedPlanId(plan.id)}
                        className={`relative rounded-xl p-4 text-left transition-all ${
                          isSelected
                            ? 'bg-primary text-primary-foreground shadow-[0_16px_34px_rgba(255,59,38,0.22)]'
                            : 'bg-[#171717] text-foreground hover:bg-[#1f1f1f]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-semibold">{plan.name}</h3>
                              {hasTrial ? (
                                <Badge className={isSelected ? 'border-0 bg-white/20 text-white hover:bg-white/25' : 'border-0 bg-[#2a2a2a] text-zinc-100'}>
                                  {plan.trial_days || 7} dias de teste
                                </Badge>
                              ) : (
                                <Badge className={isSelected ? 'border-0 bg-white/20 text-white hover:bg-white/25' : 'border-0 bg-[#2a2a2a] text-zinc-100'}>
                                  Pagamento direto
                                </Badge>
                              )}
                            </div>
                            <p className={`text-xs leading-relaxed ${isSelected ? 'text-white/85' : 'text-muted-foreground'}`}>
                              {plan.description ||
                                (hasTrial
                                  ? 'Teste liberado automaticamente. Depois do periodo, regularize em faturamento.'
                                  : 'Recursos completos liberados apos confirmacao do pagamento.')}
                            </p>
                          </div>
                          {isSelected && <CheckCircle2 className="h-5 w-5 shrink-0 text-white" />}
                        </div>
                        <div className="mt-4 flex items-end justify-between gap-3">
                          <div>
                            <p className="text-2xl font-bold">
                              {Number(plan.price || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </p>
                            <p className={`text-[10px] uppercase tracking-wider ${isSelected ? 'text-white/75' : 'text-muted-foreground'}`}>
                              {plan.billing_cycle === 'yearly' ? 'por ano' : 'por mes'}
                            </p>
                          </div>
                          <div className={`flex items-center gap-2 text-xs ${isSelected ? 'text-white/85' : 'text-muted-foreground'}`}>
                            {isMaster ? <Sparkles className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                            {hasTrial ? 'Aprovacao automatica' : 'Checkout obrigatorio'}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {plansLoading && (
                  <p className="text-center text-xs text-muted-foreground">Atualizando planos disponiveis...</p>
                )}
              </div>
            )}

            {step === 7 && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold">Termos e privacidade</h2>
                  <p className="text-xs text-muted-foreground">
                    Leia os documentos quando precisar. O aceite e obrigatorio antes do envio.
                  </p>
                </div>
                <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Versao {LEGAL_VERSION}</p>
                      <p className="text-xs text-muted-foreground">Politica de Privacidade e Termos de Uso da Vimob.</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="flex items-start gap-3 rounded-lg border border-border/50 bg-background/70 p-3 text-sm">
                      <Checkbox
                        checked={acceptedPrivacy}
                        onCheckedChange={(checked) => setAcceptedPrivacy(Boolean(checked))}
                        className="mt-0.5"
                      />
                      <span className="flex-1 leading-relaxed">
                        Li e concordo com a{' '}
                        <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => openLegalDialog('privacy')}>
                          Politica de Privacidade
                        </button>
                        .
                      </span>
                    </label>
                    <label className="flex items-start gap-3 rounded-lg border border-border/50 bg-background/70 p-3 text-sm">
                      <Checkbox
                        checked={acceptedTerms}
                        onCheckedChange={(checked) => setAcceptedTerms(Boolean(checked))}
                        className="mt-0.5"
                      />
                      <span className="flex-1 leading-relaxed">
                        Li e concordo com os{' '}
                        <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => openLegalDialog('terms')}>
                          Termos de Uso
                        </button>
                        .
                      </span>
                    </label>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" asChild>
                      <Link to="/privacidade" target="_blank">Privacidade</Link>
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1" asChild>
                      <Link to="/termos" target="_blank">Termos</Link>
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {step === 8 && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold">Confirmação</h2>
                  <p className="text-xs text-muted-foreground">Revise seus dados antes de enviar.</p>
                </div>
                <div className="bg-muted/40 rounded-xl p-5 space-y-4 border border-border/50">
                  <div className="grid grid-cols-2 gap-y-3 text-xs">
                    <div className="text-muted-foreground">Perfil:</div>
                    <div className="font-semibold capitalize text-right">{form.segment}</div>
                    <div className="text-muted-foreground">Responsável:</div>
                    <div className="font-semibold text-right">{form.responsible_name}</div>
                    <div className="text-muted-foreground">Empresa/Conta:</div>
                    <div className="font-semibold text-right">{form.company_name}</div>
                    {form.creci && (
                      <>
                        <div className="text-muted-foreground">CRECI:</div>
                        <div className="font-semibold text-right">{form.creci}</div>
                      </>
                    )}
                    {form.cnpj && (
                      <>
                        <div className="text-muted-foreground">CNPJ:</div>
                        <div className="font-semibold text-right">{form.cnpj}</div>
                      </>
                    )}
                    <div className="text-muted-foreground">Plano:</div>
                    <div className="font-semibold text-right">
                      {selectedPlan?.name} - {selectedPlanPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                  </div>
                  <Separator className="bg-border/50" />
                  <p className="text-[10px] text-center text-muted-foreground leading-relaxed">
                    Ao enviar, seu board sera criado automaticamente conforme o plano escolhido.
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 pt-6 mt-6 border-t border-border/50">
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleBack} disabled={step === 1 || loading} className="flex-1 h-11 rounded-xl font-medium">
                  Anterior
                </Button>
                {step === STEPS.length ? (
                  <Button onClick={handleSubmit} disabled={loading} className="flex-[2] h-11 rounded-xl font-bold shadow-sm">
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Enviar Solicitação'}
                  </Button>
                ) : (
                  <Button onClick={handleNext} disabled={loading} className="flex-[2] h-11 rounded-xl font-bold shadow-sm">
                    Próximo <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </div>
              <Button variant="ghost" onClick={() => navigate('/')} className="text-xs text-muted-foreground hover:text-foreground">
                Sair do onboarding
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={!!legalDialog} onOpenChange={(open) => !open && closeLegalDialog()}>
        <DialogContent className="flex max-h-[82vh] w-[calc(100vw-24px)] max-w-[620px] flex-col overflow-hidden rounded-[24px] border-0 bg-[#090909]/90 p-0 text-white shadow-[0_24px_80px_rgba(0,0,0,0.62)] backdrop-blur-2xl sm:max-w-[620px] [&>button.absolute.right-4.top-4]:hidden">
          <div className="border-b border-white/10 px-5 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-white">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
                    Versao {LEGAL_VERSION}
                  </p>
                  <h3 className="mt-1 text-lg font-bold leading-tight text-white">
                    {legalDialog === 'terms' ? 'Termos de Uso' : 'Politica de Privacidade'}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-white/55">
                    Parte {legalPageIndex + 1} de {legalSections.length}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeLegalDialog}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/8 text-white/70 transition hover:bg-white/14 hover:text-white"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${((legalPageIndex + 1) / Math.max(legalSections.length, 1)) * 100}%` }}
              />
            </div>
          </div>

          {currentLegalSection && (
            <ScrollArea className="min-h-0 flex-1 px-5 py-5 sm:px-6">
              <div className="space-y-5 pr-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                    {currentLegalSection.eyebrow}
                  </p>
                  <h4 className="mt-2 text-xl font-bold leading-tight text-white">
                    {currentLegalSection.title}
                  </h4>
                </div>
                <div className="space-y-3">
                  {currentLegalSection.items.map((item, index) => (
                    <div key={`${currentLegalSection.title}-${index}`} className="rounded-2xl bg-white/[0.055] p-4 text-sm leading-6 text-white/78">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </ScrollArea>
          )}

          <div className="border-t border-white/10 px-5 py-4 sm:px-6">
            <div className="mb-3 flex justify-center gap-1.5">
              {legalSections.map((section, index) => (
                <button
                  key={section.title}
                  type="button"
                  onClick={() => setLegalPageIndex(index)}
                  className={`h-1.5 rounded-full transition-all ${index === legalPageIndex ? 'w-7 bg-primary' : 'w-2 bg-white/18 hover:bg-white/30'}`}
                  aria-label={`Ir para parte ${index + 1}`}
                />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr]">
              <Button variant="outline" className="border-white/12 bg-white/5 text-white hover:bg-white/10 hover:text-white" asChild>
                <Link to={legalDialog === 'terms' ? '/termos' : '/privacidade'} target="_blank">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Pagina completa
                </Link>
              </Button>
              <Button
                variant="ghost"
                className="text-white/70 hover:bg-white/8 hover:text-white"
                onClick={legalPageIndex > 0 ? () => setLegalPageIndex((current) => current - 1) : closeLegalDialog}
              >
                {legalPageIndex > 0 ? 'Anterior' : 'Pular'}
              </Button>
              {legalPageIndex < legalSections.length - 1 ? (
                <Button className="bg-primary text-white hover:bg-primary/90" onClick={() => setLegalPageIndex((current) => current + 1)}>
                  Proximo
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button className="bg-primary text-white hover:bg-primary/90" onClick={finishLegalDialog}>
                  Concluir e aceitar
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Desktop background: half screen background on desktop */}
      <div className="hidden lg:block flex-1 relative bg-muted">
        {loginBgUrl ? (
          <div className="absolute inset-0">
            <img 
              src={loginBgUrl}
              alt=""
              className={`w-full h-full object-cover transition-opacity duration-1000 ${bgLoaded ? 'opacity-100' : 'opacity-0'}`}
              loading="lazy"
            />
            {/* Horizontal gradient overlay that blends into the form column */}
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/20 to-transparent" />
          </div>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/10 via-background to-primary/5" />
        )}
      </div>
    </div>
  );
}
