import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Save, Upload, Loader2, Sun, Moon, Maximize2, RefreshCw, Megaphone, Wrench, Flag, MessageSquare, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Json } from '@/integrations/supabase/types';
import { useForceRefreshBroadcast } from '@/hooks/use-force-refresh';
import { useActiveAnnouncement, useAnnouncements } from '@/hooks/use-announcements';

interface SystemSettingsValue {
  logo_url_light?: string | null;
  logo_url_dark?: string | null;
  favicon_url_light?: string | null;
  favicon_url_dark?: string | null;
  pwa_icon_url?: string | null;
  login_bg_url?: string | null;
  default_whatsapp?: string | null;
  logo_width?: number | null;
  logo_height?: number | null;
  maintenance_mode?: boolean | null;
  maintenance_message?: string | null;
  feature_flags?: Record<string, boolean> | null;
  notification_instance_name?: string | null;
}

interface SystemSettingsRow {
  id: string;
  key: string;
  value: Json;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export default function AdminSettings() {
  const [settings, setSettings] = useState<{ id: string } & SystemSettingsValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSize, setSavingSize] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [uploadingLight, setUploadingLight] = useState(false);
  const [uploadingDark, setUploadingDark] = useState(false);
  const [uploadingFaviconLight, setUploadingFaviconLight] = useState(false);
  const [uploadingFaviconDark, setUploadingFaviconDark] = useState(false);
  const [uploadingPwaIcon, setUploadingPwaIcon] = useState(false);
  const [uploadingLoginBg, setUploadingLoginBg] = useState(false);
  const [logoWidth, setLogoWidth] = useState(140);
  const [logoHeight, setLogoHeight] = useState(40);
  const [broadcastingRefresh, setBroadcastingRefresh] = useState(false);
  
  // Maintenance mode state
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [savingMaintenance, setSavingMaintenance] = useState(false);

  // Feature flags state
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
  const [savingFlags, setSavingFlags] = useState(false);

  // WhatsApp notification instance state
  const [notificationInstanceName, setNotificationInstanceName] = useState('');
  const [savingInstance, setSavingInstance] = useState(false);
  const [checkingInstance, setCheckingInstance] = useState(false);
  const [instanceConnected, setInstanceConnected] = useState<boolean | null>(null);

  // Announcements state
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [buttonText, setButtonText] = useState('');
  const [buttonUrl, setButtonUrl] = useState('');
  
  const { broadcastRefresh } = useForceRefreshBroadcast();
  const { data: activeAnnouncement } = useActiveAnnouncement();
  const { publish, deactivate, currentAnnouncement } = useAnnouncements();
  
  // Preencher campos com comunicado ativo
  useEffect(() => {
    if (activeAnnouncement) {
      setAnnouncementMessage(activeAnnouncement.message || '');
      setButtonText(activeAnnouncement.button_text || '');
      setButtonUrl(activeAnnouncement.button_url || '');
    }
  }, [activeAnnouncement]);

  const handlePublishAnnouncement = async () => {
    if (!announcementMessage.trim()) {
      toast.error('Informe a mensagem do comunicado');
      return;
    }
    await publish.mutateAsync({ message: announcementMessage, buttonText, buttonUrl });
  };

  const handleDeactivateAnnouncement = async () => {
    if (currentAnnouncement) {
      await deactivate.mutateAsync(currentAnnouncement.id);
    }
    setAnnouncementMessage('');
    setButtonText('');
    setButtonUrl('');
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from('system_settings')
      .select('*')
      .limit(1)
      .single();

    if (error) {
      console.error('Error fetching settings:', error);
    } else if (data) {
      const row = data as SystemSettingsRow;
      const value = (row.value || {}) as SystemSettingsValue;
      setSettings({
        id: row.id,
        logo_url_light: value.logo_url_light || null,
        logo_url_dark: value.logo_url_dark || null,
        favicon_url_light: value.favicon_url_light || null,
        favicon_url_dark: value.favicon_url_dark || null,
        pwa_icon_url: value.pwa_icon_url || null,
        login_bg_url: value.login_bg_url || null,
        default_whatsapp: value.default_whatsapp || null,
        logo_width: value.logo_width || null,
        logo_height: value.logo_height || null,
        maintenance_mode: value.maintenance_mode || false,
        maintenance_message: value.maintenance_message || '',
        feature_flags: value.feature_flags || {},
        notification_instance_name: value.notification_instance_name || null,
      });
      setWhatsapp(value.default_whatsapp || '');
      setLogoWidth(value.logo_width || 140);
      setLogoHeight(value.logo_height || 40);
      setMaintenanceMode(value.maintenance_mode || false);
      setMaintenanceMessage(value.maintenance_message || '');
      setFeatureFlags(value.feature_flags || {});
      setNotificationInstanceName(value.notification_instance_name || '');
    }
    setLoading(false);
  };

  const updateSettingsValue = async (updates: Partial<SystemSettingsValue>) => {
    if (!settings) return;

    const currentValue: SystemSettingsValue = {
      logo_url_light: settings.logo_url_light,
      logo_url_dark: settings.logo_url_dark,
      favicon_url_light: settings.favicon_url_light,
      favicon_url_dark: settings.favicon_url_dark,
      pwa_icon_url: settings.pwa_icon_url,
      login_bg_url: settings.login_bg_url,
      default_whatsapp: settings.default_whatsapp,
      logo_width: settings.logo_width,
      logo_height: settings.logo_height,
      maintenance_mode: settings.maintenance_mode,
      maintenance_message: settings.maintenance_message,
      feature_flags: settings.feature_flags,
      notification_instance_name: settings.notification_instance_name,
    };

    const newValue = { ...currentValue, ...updates };

    const { error } = await supabase
      .from('system_settings')
      .update({ value: newValue as unknown as Json })
      .eq('id', settings.id);

    if (error) throw error;

    setSettings(prev => prev ? { ...prev, ...updates } : null);
  };

  const handleSaveMaintenance = async () => {
    if (!settings) return;
    setSavingMaintenance(true);
    try {
      await updateSettingsValue({ maintenance_mode: maintenanceMode, maintenance_message: maintenanceMessage });
      toast.success('Configurações de manutenção salvas!');
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setSavingMaintenance(false);
    }
  };

  const handleSaveFlags = async () => {
    if (!settings) return;
    setSavingFlags(true);
    try {
      await updateSettingsValue({ feature_flags: featureFlags });
      toast.success('Feature flags salvas!');
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setSavingFlags(false);
    }
  };

  const handleUploadLogo = async (file: File, type: 'light' | 'dark') => {
    if (!settings) return;

    const setUploading = type === 'light' ? setUploadingLight : setUploadingDark;
    setUploading(true);

    try {
      const ext = file.name.split('.').pop();
      const path = `system/logo-${type}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(path);

      const updateField = type === 'light' ? 'logo_url_light' : 'logo_url_dark';
      await updateSettingsValue({ [updateField]: publicUrl });

      toast.success(`Logo ${type === 'light' ? 'clara' : 'escura'} atualizada!`);
    } catch (error: any) {
      toast.error('Erro ao fazer upload: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleUploadFavicon = async (file: File, type: 'light' | 'dark') => {
    if (!settings) return;

    const setUploading = type === 'light' ? setUploadingFaviconLight : setUploadingFaviconDark;
    setUploading(true);

    try {
      const ext = file.name.split('.').pop();
      const path = `system/favicon-${type}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(path);

      const updateField = type === 'light' ? 'favicon_url_light' : 'favicon_url_dark';
      await updateSettingsValue({ [updateField]: publicUrl });

      toast.success(`Ícone ${type === 'light' ? 'claro' : 'escuro'} atualizado!`);
    } catch (error: any) {
      toast.error('Erro ao fazer upload: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleUploadPwaIcon = async (file: File) => {
    if (!settings) return;
    setUploadingPwaIcon(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `system/pwa-icon.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(path);
      await updateSettingsValue({ pwa_icon_url: publicUrl });
      toast.success('Ícone do PWA atualizado!');
    } catch (error: any) {
      toast.error('Erro ao fazer upload: ' + error.message);
    } finally {
      setUploadingPwaIcon(false);
    }
  };

  const handleUploadLoginBg = async (file: File) => {
    if (!settings) return;
    setUploadingLoginBg(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `system/login-bg.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(path);
      await updateSettingsValue({ login_bg_url: publicUrl });
      toast.success('Imagem de fundo do login atualizada!');
    } catch (error: any) {
      toast.error('Erro ao fazer upload: ' + error.message);
    } finally {
      setUploadingLoginBg(false);
    }
  };

  const handleSaveWhatsapp = async () => {
    if (!settings) return;

    setSaving(true);
    try {
      await updateSettingsValue({ default_whatsapp: whatsapp });
      toast.success('WhatsApp atualizado!');
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLogoSize = async () => {
    if (!settings) return;

    setSavingSize(true);
    try {
      await updateSettingsValue({ logo_width: logoWidth, logo_height: logoHeight });
      toast.success('Tamanho da logo atualizado!');
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setSavingSize(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Configurações do Sistema">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Configurações do Sistema">
      <div className="space-y-6">
        {/* Logo Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Logos do Sistema</CardTitle>
            <CardDescription>
              Configure as logos que serão exibidas em todo o sistema. 
              Use uma logo para tema claro e outra para tema escuro.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 md:px-6 pb-4 space-y-6">
            {/* Light Theme Logo */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Sun className="h-4 w-4" />
                Logo para Tema Claro
              </Label>
              <div className="flex items-center gap-4">
                <div 
                  className="w-48 h-24 rounded-lg bg-white border-2 border-dashed border-border flex items-center justify-center overflow-hidden"
                >
                  {settings?.logo_url_light ? (
                    <img 
                      src={settings.logo_url_light} 
                      alt="Logo Light" 
                      style={{ maxWidth: logoWidth, maxHeight: logoHeight }}
                      className="object-contain"
                    />
                  ) : (
                    <span className="text-muted-foreground text-sm">Sem logo</span>
                  )}
                </div>
                <div>
                  <input
                    type="file"
                    id="logo-light-upload"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadLogo(file, 'light');
                    }}
                  />
                  <Button 
                    variant="outline" 
                    onClick={() => document.getElementById('logo-light-upload')?.click()}
                    disabled={uploadingLight}
                  >
                    {uploadingLight ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Upload Logo Clara
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">
                    Recomendado: fundo transparente ou branco
                  </p>
                </div>
              </div>
            </div>

            {/* Dark Theme Logo */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Moon className="h-4 w-4" />
                Logo para Tema Escuro
              </Label>
              <div className="flex items-center gap-4">
                <div 
                  className="w-48 h-24 rounded-lg bg-slate-900 border-2 border-dashed border-border flex items-center justify-center overflow-hidden"
                >
                  {settings?.logo_url_dark ? (
                    <img 
                      src={settings.logo_url_dark} 
                      alt="Logo Dark" 
                      style={{ maxWidth: logoWidth, maxHeight: logoHeight }}
                      className="object-contain"
                    />
                  ) : (
                    <span className="text-slate-400 text-sm">Sem logo</span>
                  )}
                </div>
                <div>
                  <input
                    type="file"
                    id="logo-dark-upload"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadLogo(file, 'dark');
                    }}
                  />
                  <Button 
                    variant="outline" 
                    onClick={() => document.getElementById('logo-dark-upload')?.click()}
                    disabled={uploadingDark}
                  >
                    {uploadingDark ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Upload Logo Escura
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">
                    Recomendado: fundo transparente ou escuro
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Favicon Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Ícone da Sidebar (Favicon)</CardTitle>
            <CardDescription>
              Ícone pequeno exibido na sidebar quando recolhida.
              Recomendado: 32x32px ou 40x40px com fundo transparente.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 md:px-6 pb-4 space-y-6">
            {/* Light Theme Favicon */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Sun className="h-4 w-4" />
                Ícone para Tema Claro
              </Label>
              <div className="flex items-center gap-4">
                <div 
                  className="w-16 h-16 rounded-lg bg-white border-2 border-dashed border-border flex items-center justify-center overflow-hidden"
                >
                  {settings?.favicon_url_light ? (
                    <img 
                      src={settings.favicon_url_light} 
                      alt="Favicon Light" 
                      className="w-10 h-10 object-contain"
                    />
                  ) : (
                    <span className="text-muted-foreground text-xs">Sem ícone</span>
                  )}
                </div>
                <div>
                  <input
                    type="file"
                    id="favicon-light-upload"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadFavicon(file, 'light');
                    }}
                  />
                  <Button 
                    variant="outline" 
                    onClick={() => document.getElementById('favicon-light-upload')?.click()}
                    disabled={uploadingFaviconLight}
                  >
                    {uploadingFaviconLight ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Upload Ícone Claro
                  </Button>
                </div>
              </div>
            </div>

            {/* Dark Theme Favicon */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Moon className="h-4 w-4" />
                Ícone para Tema Escuro
              </Label>
              <div className="flex items-center gap-4">
                <div 
                  className="w-16 h-16 rounded-lg bg-slate-900 border-2 border-dashed border-border flex items-center justify-center overflow-hidden"
                >
                  {settings?.favicon_url_dark ? (
                    <img 
                      src={settings.favicon_url_dark} 
                      alt="Favicon Dark" 
                      className="w-10 h-10 object-contain"
                    />
                  ) : (
                    <span className="text-slate-400 text-xs">Sem ícone</span>
                  )}
                </div>
                <div>
                  <input
                    type="file"
                    id="favicon-dark-upload"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadFavicon(file, 'dark');
                    }}
                  />
                  <Button 
                    variant="outline" 
                    onClick={() => document.getElementById('favicon-dark-upload')?.click()}
                    disabled={uploadingFaviconDark}
                  >
                    {uploadingFaviconDark ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Upload Ícone Escuro
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* PWA Icon Settings disabled as requested */}
        {/* <Card>
          <CardHeader>
            <CardTitle>Ícone do Aplicativo (PWA)</CardTitle>
            <CardDescription>
              Este ícone será usado para o ícone da tela inicial no iOS e Android quando o app for instalado.
              Recomendado: 512x512px, PNG, sem transparência para melhor compatibilidade.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 md:px-6 pb-4 space-y-6">
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Maximize2 className="h-4 w-4" />
                Ícone do PWA / Tela Inicial
              </Label>
              <div className="flex items-center gap-4">
                <div 
                  className="w-24 h-24 rounded-2xl bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-border flex items-center justify-center overflow-hidden"
                >
                  {settings?.pwa_icon_url ? (
                    <img 
                      src={settings.pwa_icon_url} 
                      alt="PWA Icon" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-muted-foreground text-xs text-center p-2">Sem ícone definido</span>
                  )}
                </div>
                <div>
                  <input
                    type="file"
                    id="pwa-icon-upload"
                    accept="image/png, image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadPwaIcon(file);
                    }}
                  />
                  <Button 
                    variant="outline" 
                    onClick={() => document.getElementById('pwa-icon-upload')?.click()}
                    disabled={uploadingPwaIcon}
                  >
                    {uploadingPwaIcon ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Upload Ícone PWA
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2 max-w-xs">
                    Este ícone atualiza automaticamente a manifest do aplicativo para dispositivos móveis.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card> */}

        {/* Login Background Image */}
        <Card>
          <CardHeader>
            <CardTitle>Imagem de Fundo do Login</CardTitle>
            <CardDescription>
              Imagem exibida no lado direito da tela de login. Recomendado: 1920x1080px.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 md:px-6 pb-4 space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-64 h-36 rounded-lg bg-slate-900 border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
                {settings?.login_bg_url ? (
                  <img 
                    src={settings.login_bg_url} 
                    alt="Login Background" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-muted-foreground text-sm">Sem imagem</span>
                )}
              </div>
              <div>
                <input
                  type="file"
                  id="login-bg-upload"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadLoginBg(file);
                  }}
                />
                <Button 
                  variant="outline" 
                  onClick={() => document.getElementById('login-bg-upload')?.click()}
                  disabled={uploadingLoginBg}
                >
                  {uploadingLoginBg ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Upload Imagem
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  Recomendado: imagem de alta qualidade, 1920x1080px
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logo Size Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Maximize2 className="h-5 w-5" />
              Tamanho da Logo
            </CardTitle>
            <CardDescription>
              Ajuste as dimensões da logo exibida no sistema (em pixels)
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 md:px-6 pb-4 space-y-6">
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Largura Máxima</Label>
                  <span className="text-sm font-medium text-muted-foreground">{logoWidth}px</span>
                </div>
                <Slider
                  value={[logoWidth]}
                  onValueChange={(value) => setLogoWidth(value[0])}
                  min={40}
                  max={300}
                  step={10}
                  className="w-full"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Altura Máxima</Label>
                  <span className="text-sm font-medium text-muted-foreground">{logoHeight}px</span>
                </div>
                <Slider
                  value={[logoHeight]}
                  onValueChange={(value) => setLogoHeight(value[0])}
                  min={20}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>

              {/* Preview */}
              <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                <Label className="text-xs text-muted-foreground mb-2 block">Pré-visualização</Label>
                <div className="flex items-center justify-center h-20 bg-background rounded border">
                  {settings?.logo_url_light ? (
                    <img 
                      src={settings.logo_url_light} 
                      alt="Preview" 
                      style={{ maxWidth: logoWidth, maxHeight: logoHeight }}
                      className="object-contain"
                    />
                  ) : (
                    <span className="text-muted-foreground text-sm">Nenhuma logo</span>
                  )}
                </div>
              </div>
            </div>

            <Button onClick={handleSaveLogoSize} disabled={savingSize}>
              {savingSize && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Save className="h-4 w-4 mr-2" />
              Salvar Tamanho
            </Button>
          </CardContent>
        </Card>

        {/* WhatsApp Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Contato WhatsApp</CardTitle>
            <CardDescription>
              Número de WhatsApp para novos interessados
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 md:px-6 pb-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="whatsapp">Número do WhatsApp</Label>
              <Input
                id="whatsapp"
                placeholder="5511999999999"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Formato: código do país + DDD + número (apenas números)
              </p>
            </div>
            <Button onClick={handleSaveWhatsapp} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Save className="h-4 w-4 mr-2" />
              Salvar
            </Button>
          </CardContent>
        </Card>

        {/* WhatsApp Notification Instance Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-green-500" />
              WhatsApp de Notificações (Global)
            </CardTitle>
            <CardDescription>
              Configure uma instância WhatsApp central para enviar notificações automáticas. 
              Organizações que possuem seu próprio WhatsApp de notificação usarão o deles. 
              As demais receberão notificações por este WhatsApp global.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 md:px-6 pb-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="notification-instance">Nome da Instância (Evolution API)</Label>
              <Input
                id="notification-instance"
                placeholder="ex: vetor-notifications"
                value={notificationInstanceName}
                onChange={(e) => {
                  setNotificationInstanceName(e.target.value);
                  setInstanceConnected(null);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Informe o nome da instância já criada no Evolution API que será usada para notificações globais.
              </p>
            </div>

            {instanceConnected !== null && (
              <div className={`flex items-center gap-2 p-3 rounded-lg border ${
                instanceConnected 
                  ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' 
                  : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
              }`}>
                {instanceConnected ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-700 dark:text-green-300 font-medium">Instância conectada</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span className="text-sm text-red-700 dark:text-red-300 font-medium">Instância desconectada</span>
                  </>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button 
                variant="outline"
                onClick={async () => {
                  if (!notificationInstanceName.trim()) {
                    toast.error('Informe o nome da instância');
                    return;
                  }
                  setCheckingInstance(true);
                  try {
                    const { data, error } = await supabase.functions.invoke('global-whatsapp-status', {
                      body: { instance_name: notificationInstanceName },
                    });
                    if (error) throw error;
                    setInstanceConnected(data?.connected ?? false);
                    if (data?.connected) {
                      toast.success('Instância conectada!');
                    } else {
                      toast.warning('Instância não está conectada');
                    }
                  } catch (error: any) {
                    toast.error('Erro ao verificar: ' + error.message);
                    setInstanceConnected(false);
                  } finally {
                    setCheckingInstance(false);
                  }
                }}
                disabled={checkingInstance || !notificationInstanceName.trim()}
              >
                {checkingInstance ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Verificar Conexão
              </Button>

              <Button 
                onClick={async () => {
                  if (!settings) return;
                  setSavingInstance(true);
                  try {
                    await updateSettingsValue({ notification_instance_name: notificationInstanceName || null });
                    toast.success('Instância de notificação salva!');
                  } catch (error: any) {
                    toast.error('Erro ao salvar: ' + error.message);
                  } finally {
                    setSavingInstance(false);
                  }
                }}
                disabled={savingInstance}
              >
                {savingInstance ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              Comunicados
            </CardTitle>
            <CardDescription>
              Exiba um aviso no topo de todas as telas para todos os usuários. 
              Ao publicar, uma notificação também é enviada para todos.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 md:px-6 pb-4 space-y-4">
            {activeAnnouncement && (
              <div className="bg-orange-50 dark:bg-orange-950/30 p-3 rounded-lg border border-orange-200 dark:border-orange-800 mb-4">
                <p className="text-sm text-orange-800 dark:text-orange-200 font-medium">
                  ✅ Comunicado ativo: "{activeAnnouncement.message}"
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Mensagem do comunicado</Label>
              <Textarea 
                placeholder="Nova atualização disponível! Confira as novidades."
                value={announcementMessage}
                onChange={(e) => setAnnouncementMessage(e.target.value)}
                rows={3}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Texto do botão (opcional)</Label>
                <Input 
                  placeholder="Saiba mais"
                  value={buttonText}
                  onChange={(e) => setButtonText(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Link do botão (opcional)</Label>
                <Input 
                  placeholder="https://..."
                  value={buttonUrl}
                  onChange={(e) => setButtonUrl(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <Button 
                onClick={handlePublishAnnouncement}
                disabled={publish.isPending || !announcementMessage.trim()}
              >
                {publish.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Megaphone className="h-4 w-4 mr-2" />
                {activeAnnouncement ? 'Atualizar e Publicar' : 'Publicar Comunicado'}
              </Button>

              {activeAnnouncement && (
                <Button 
                  variant="outline"
                  onClick={handleDeactivateAnnouncement}
                  disabled={deactivate.isPending}
                >
                  {deactivate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Desativar Comunicado
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Maintenance Mode Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-amber-500" />
              Modo Manutenção
            </CardTitle>
            <CardDescription>
              Exibe um banner de aviso para todos os usuários não-administradores enquanto o sistema está em manutenção.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 md:px-6 pb-4 space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="space-y-0.5">
                <Label className="text-base">Ativar modo manutenção</Label>
                <p className="text-sm text-muted-foreground">
                  Usuários comuns verão um banner fixo no topo da tela
                </p>
              </div>
              <Switch
                checked={maintenanceMode}
                onCheckedChange={setMaintenanceMode}
              />
            </div>

            <div className="space-y-2">
              <Label>Mensagem de manutenção</Label>
              <Textarea
                placeholder="O sistema está em manutenção programada. Voltaremos em breve!"
                value={maintenanceMessage}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Deixe em branco para usar a mensagem padrão.
              </p>
            </div>

            {/* Live preview */}
            {maintenanceMode && (
              <div className="rounded-lg bg-amber-500 text-white py-2.5 px-4 flex items-center justify-center gap-3">
                <Wrench className="h-4 w-4 shrink-0" />
                <span className="text-sm font-medium text-center">
                  {maintenanceMessage || 'O sistema está em manutenção. Por favor, aguarde.'}
                </span>
              </div>
            )}

            <Button onClick={handleSaveMaintenance} disabled={savingMaintenance}>
              {savingMaintenance && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Save className="h-4 w-4 mr-2" />
              Salvar Configurações de Manutenção
            </Button>
          </CardContent>
        </Card>

        {/* Feature Flags Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-primary" />
              Feature Flags
            </CardTitle>
            <CardDescription>
              Habilite ou desabilite funcionalidades globalmente para todas as organizações.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 md:px-6 pb-4 space-y-4">
            {[
              { key: 'multi_pipeline', label: 'Múltiplos Pipelines', description: 'Permite criar e gerenciar vários pipelines por organização (experimental)' },
              { key: 'telecom_module', label: 'Módulo Telecom', description: 'Ativa o módulo de clientes e faturamento de telecomunicações' },
              { key: 'ai_assistant', label: 'Assistente de IA', description: 'Habilita o assistente de IA para sugestões e automações (beta)' },
              { key: 'advanced_reports', label: 'Relatórios Avançados', description: 'Relatórios detalhados com exportação e filtros avançados' },
            ].map(({ key, label, description }) => (
              <div key={key} className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="space-y-0.5">
                  <Label className="text-base">{label}</Label>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
                <Switch
                  checked={featureFlags[key] ?? false}
                  onCheckedChange={(checked) =>
                    setFeatureFlags(prev => ({ ...prev, [key]: checked }))
                  }
                />
              </div>
            ))}

            <Button onClick={handleSaveFlags} disabled={savingFlags}>
              {savingFlags && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Save className="h-4 w-4 mr-2" />
              Salvar Feature Flags
            </Button>
          </CardContent>
        </Card>

        {/* Force Refresh Card */}
        <Card className="border-orange-200 dark:border-orange-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-orange-500" />
              Forçar Atualização Global
            </CardTitle>
            <CardDescription>
              Força todos os usuários conectados a recarregarem a página, 
              garantindo que vejam as últimas atualizações do sistema.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 md:px-6 pb-4 space-y-4">
            <div className="bg-orange-50 dark:bg-orange-950/30 p-4 rounded-lg border border-orange-200 dark:border-orange-800">
              <p className="text-sm text-orange-800 dark:text-orange-200">
                ⚠️ <strong>Atenção:</strong> Isso vai desconectar e recarregar a página de todos os usuários 
                que estão usando o sistema neste momento. Use apenas quando necessário.
              </p>
            </div>
            <Button 
              variant="outline"
              className="border-orange-500 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
              onClick={async () => {
                setBroadcastingRefresh(true);
                try {
                  await broadcastRefresh();
                  toast.success('Sinal de atualização enviado para todos os usuários!');
                } catch (error: any) {
                  toast.error('Erro ao enviar sinal: ' + error.message);
                } finally {
                  setBroadcastingRefresh(false);
                }
              }}
              disabled={broadcastingRefresh}
            >
              {broadcastingRefresh ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Forçar Atualização para Todos
            </Button>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}