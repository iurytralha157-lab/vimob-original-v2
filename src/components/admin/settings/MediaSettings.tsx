import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Upload, Trash2, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SystemSettings, SystemSettingsValue } from '@/hooks/use-system-settings';

interface MediaSettingsProps {
  settings: SystemSettings | null;
  onUpdate: (updates: Partial<SystemSettingsValue>) => Promise<void>;
}

export function MediaSettings({ settings, onUpdate }: MediaSettingsProps) {
  const [uploading, setUploading] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'logo_principal' | 'logo_secundaria' | 'favicon') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validations
    const allowedTypes = ['image/jpeg', 'image/png', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Formato não permitido. Use JPG, PNG ou SVG.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('O arquivo deve ter no máximo 2MB.');
      return;
    }

    setUploading(field);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `system/${field}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(filePath);

      await onUpdate({ [field]: publicUrl });
      toast.success('Upload realizado com sucesso!');
    } catch (error: any) {
      toast.error('Erro no upload: ' + error.message);
    } finally {
      setUploading(null);
    }
  };

  const handleAddStandardImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('O arquivo deve ter no máximo 2MB.');
      return;
    }

    setUploading('imagens_padrao');
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `system/standard-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(filePath);

      const currentImages = settings?.imagens_padrao || [];
      await onUpdate({ imagens_padrao: [...currentImages, publicUrl] });
      toast.success('Imagem adicionada à galeria!');
    } catch (error: any) {
      toast.error('Erro no upload: ' + error.message);
    } finally {
      setUploading(null);
    }
  };

  const removeStandardImage = async (url: string) => {
    const currentImages = settings?.imagens_padrao || [];
    await onUpdate({ imagens_padrao: currentImages.filter(img => img !== url) });
    toast.success('Imagem removida.');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Identidade Visual</CardTitle>
          <CardDescription>Gerencie as logos e o favicon do sistema.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-4">
              <Label>Logo Principal</Label>
              <div className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center min-h-[150px] relative group">
                {settings?.logo_principal ? (
                  <img src={settings.logo_principal} alt="Logo Principal" className="max-h-24 object-contain" />
                ) : (
                  <ImageIcon className="h-10 w-10 text-muted-foreground" />
                )}
                <input
                  type="file"
                  id="logo_principal"
                  className="hidden"
                  onChange={(e) => handleUpload(e, 'logo_principal')}
                  accept=".jpg,.png,.svg"
                />
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-4"
                  onClick={() => document.getElementById('logo_principal')?.click()}
                  disabled={uploading === 'logo_principal'}
                >
                  {uploading === 'logo_principal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  Trocar Logo
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <Label>Logo Secundária</Label>
              <div className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center min-h-[150px]">
                {settings?.logo_secundaria ? (
                  <img src={settings.logo_secundaria} alt="Logo Secundária" className="max-h-24 object-contain" />
                ) : (
                  <ImageIcon className="h-10 w-10 text-muted-foreground" />
                )}
                <input
                  type="file"
                  id="logo_secundaria"
                  className="hidden"
                  onChange={(e) => handleUpload(e, 'logo_secundaria')}
                  accept=".jpg,.png,.svg"
                />
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-4"
                  onClick={() => document.getElementById('logo_secundaria')?.click()}
                  disabled={uploading === 'logo_secundaria'}
                >
                  {uploading === 'logo_secundaria' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  Trocar Logo
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <Label>Favicon</Label>
              <div className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center min-h-[150px]">
                {settings?.favicon ? (
                  <img src={settings.favicon} alt="Favicon" className="h-12 w-12 object-contain" />
                ) : (
                  <ImageIcon className="h-10 w-10 text-muted-foreground" />
                )}
                <input
                  type="file"
                  id="favicon"
                  className="hidden"
                  onChange={(e) => handleUpload(e, 'favicon')}
                  accept=".jpg,.png,.svg"
                />
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-4"
                  onClick={() => document.getElementById('favicon')?.click()}
                  disabled={uploading === 'favicon'}
                >
                  {uploading === 'favicon' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  Trocar Ícone
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            <div className="space-y-4">
              <Label>Ícone PWA</Label>
              <div className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center min-h-[150px]">
                {settings?.pwa_icon_url ? (
                  <img src={settings.pwa_icon_url} alt="PWA Icon" className="h-20 w-20 object-contain" />
                ) : (
                  <ImageIcon className="h-10 w-10 text-muted-foreground" />
                )}
                <input
                  type="file"
                  id="pwa_icon_url"
                  className="hidden"
                  onChange={(e) => handleUpload(e, 'pwa_icon_url' as any)}
                  accept=".jpg,.png,.svg"
                />
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-4"
                  onClick={() => document.getElementById('pwa_icon_url')?.click()}
                  disabled={uploading === 'pwa_icon_url'}
                >
                  {uploading === 'pwa_icon_url' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  Trocar Ícone PWA
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <Label>Fundo do Login</Label>
              <div className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center min-h-[150px]">
                {settings?.login_bg_url ? (
                  <img src={settings.login_bg_url} alt="Login BG" className="max-h-24 w-full object-cover rounded" />
                ) : (
                  <ImageIcon className="h-10 w-10 text-muted-foreground" />
                )}
                <input
                  type="file"
                  id="login_bg_url"
                  className="hidden"
                  onChange={(e) => handleUpload(e, 'login_bg_url' as any)}
                  accept=".jpg,.png,.svg,.webp"
                />
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-4"
                  onClick={() => document.getElementById('login_bg_url')?.click()}
                  disabled={uploading === 'login_bg_url'}
                >
                  {uploading === 'login_bg_url' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  Trocar Fundo
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
            <div className="space-y-2">
              <Label>Largura da Logo (px)</Label>
              <Input 
                type="number" 
                value={settings?.logo_width || 140} 
                onChange={(e) => onUpdate({ logo_width: parseInt(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Altura da Logo (px)</Label>
              <Input 
                type="number" 
                value={settings?.logo_height || 40} 
                onChange={(e) => onUpdate({ logo_height: parseInt(e.target.value) })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
