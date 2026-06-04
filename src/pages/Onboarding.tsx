import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { 
  Building2, User, Globe, CheckCircle2, 
  Upload, Loader2, ChevronRight, ChevronLeft, Construction,
  Instagram, Facebook, Youtube, Linkedin, Mail, Scissors
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
  { id: 6, title: 'Confirmação' },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
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

  const updateField = (field: string, value: any) => setForm((prev) => ({ ...prev, [field]: value }));

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
    if (step === 2 && (!form.responsible_name || !form.responsible_email)) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }
    if (step === 3 && !form.company_name) {
      toast.error('Nome da empresa/profissional é obrigatório');
      return;
    }
    setStep((prev) => prev + 1);
  };

  const handleBack = () => setStep((prev) => prev - 1);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('submit-onboarding', { body: form });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSubmitted(true);
      toast.success('Solicitação enviada!');
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
            <h2 className="text-2xl font-bold">Solicitação recebida!</h2>
            <p className="text-muted-foreground">
              Nossa equipe vai analisar e liberar seu acesso em breve. Você receberá um e-mail de confirmação.
            </p>
            <Button className="mt-4 w-full" onClick={() => navigate('/')}>Voltar ao Início</Button>
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
                      <Label htmlFor="responsible_phone" className="text-xs">WhatsApp</Label>
                      <Input id="responsible_phone" value={form.responsible_phone} onChange={(e) => updateField('responsible_phone', maskPhone(e.target.value))} placeholder="(00) 00000-0000" className="h-10 text-sm rounded-lg" />
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
                    <Label htmlFor="primary_color" className="text-xs">Cor principal da marca</Label>
                    <div className="flex gap-2">
                      <input 
                        id="primary_color" 
                        type="color" 
                        className="w-12 h-10 p-1 cursor-pointer bg-transparent border rounded-lg" 
                        value={form.primary_color} 
                        onChange={(e) => updateField('primary_color', e.target.value)} 
                      />
                      <Input 
                        value={form.primary_color} 
                        onChange={(e) => updateField('primary_color', e.target.value)} 
                        className="font-mono h-10 text-sm rounded-lg" 
                        placeholder="#000000"
                      />
                    </div>
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
                  </div>
                  <Separator className="bg-border/50" />
                  <p className="text-[10px] text-center text-muted-foreground leading-relaxed">
                    Ao enviar, você solicita a análise dos seus dados para liberação do acesso.
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
