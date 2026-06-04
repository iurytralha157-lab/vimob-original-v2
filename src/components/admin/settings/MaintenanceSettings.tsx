import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, Wrench, RefreshCw, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { SystemSettings, SystemSettingsValue } from '@/hooks/use-system-settings';

interface MaintenanceSettingsProps {
  settings: SystemSettings | null;
  onUpdate: (updates: Partial<SystemSettingsValue>) => Promise<void>;
}

export function MaintenanceSettings({ settings, onUpdate }: MaintenanceSettingsProps) {
  const [saving, setSaving] = useState(false);
  const [maintenance, setMaintenance] = useState({
    enabled: false,
    message: '',
    allowed_ips: [] as string[]
  });
  const [newIp, setNewIp] = useState('');

  useEffect(() => {
    if (settings) {
      if (settings.maintenance_config) setMaintenance(settings.maintenance_config);
    }
  }, [settings]);

  const handleSaveMaintenance = async () => {
    setSaving(true);
    try {
      await onUpdate({ maintenance });
      toast.success('Configurações de manutenção salvas!');
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const addIp = () => {
    if (!newIp) return;
    if (maintenance.allowed_ips.includes(newIp)) {
      toast.error('IP já está na lista.');
      return;
    }
    setMaintenance({ ...maintenance, allowed_ips: [...maintenance.allowed_ips, newIp] });
    setNewIp('');
  };

  const removeIp = (ip: string) => {
    setMaintenance({ ...maintenance, allowed_ips: maintenance.allowed_ips.filter(i => i !== ip) });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-orange-500" />
              <div>
                <CardTitle>Modo de Manutenção</CardTitle>
                <CardDescription>Coloque o sistema em manutenção para realizar atualizações críticas.</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="maint-enabled">Ativo</Label>
              <Switch 
                id="maint-enabled" 
                checked={maintenance.enabled} 
                onCheckedChange={(checked) => setMaintenance({ ...maintenance, enabled: checked })} 
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Mensagem de Manutenção</Label>
            <Textarea 
              value={maintenance.message} 
              onChange={(e) => setMaintenance({ ...maintenance, message: e.target.value })}
              placeholder="O sistema está em manutenção. Voltaremos em breve."
              className="min-h-[100px]"
            />
          </div>
          <div className="space-y-2">
            <Label>IPs Permitidos (Override)</Label>
            <div className="flex gap-2">
              <Input 
                value={newIp} 
                onChange={(e) => setNewIp(e.target.value)}
                placeholder="Ex: 192.168.1.1"
              />
              <Button variant="outline" onClick={addIp}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {maintenance.allowed_ips.map(ip => (
                <div key={ip} className="flex items-center gap-2 bg-muted px-2 py-1 rounded-md text-sm">
                  {ip}
                  <X className="h-3 w-3 cursor-pointer hover:text-destructive" onClick={() => removeIp(ip)} />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Estes IPs poderão acessar o sistema mesmo em manutenção.</p>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveMaintenance} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar Manutenção
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-purple-500" />
            <div>
              <CardTitle>Feature Flags</CardTitle>
              <CardDescription>Ative ou desative funcionalidades em desenvolvimento para todos os usuários.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            {settings?.feature_flags && Object.entries(settings.feature_flags).map(([key, enabled]) => (
              <div key={key} className="flex items-center justify-between p-2 border rounded">
                <Label className="font-mono">{key}</Label>
                <Switch 
                  checked={!!enabled} 
                  onCheckedChange={(checked) => {
                    const newFlags = { ...settings.feature_flags, [key]: checked };
                    onUpdate({ feature_flags: newFlags });
                  }}
                />
              </div>
            ))}
            <div className="flex gap-2">
              <Input 
                id="new-flag"
                placeholder="Nome da nova flag (ex: new_dashboard)"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const input = e.currentTarget;
                    const val = input.value.trim();
                    if (val) {
                      const newFlags = { ...settings?.feature_flags, [val]: false };
                      onUpdate({ feature_flags: newFlags });
                      input.value = '';
                    }
                  }
                }}
              />
              <Button variant="outline" onClick={() => {
                const input = document.getElementById('new-flag') as HTMLInputElement;
                const val = input.value.trim();
                if (val) {
                  const newFlags = { ...settings?.feature_flags, [val]: false };
                  onUpdate({ feature_flags: newFlags });
                  input.value = '';
                }
              }}>Adicionar Flag</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
