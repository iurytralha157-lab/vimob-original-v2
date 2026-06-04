import { useState, useEffect } from 'react';
import { 
  Megaphone,
  Send,
  Bell,
  Users,
  Building2,
  User,
  X,
  Eye
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAnnouncements } from '@/hooks/use-announcements';
import { useSuperAdmin } from '@/hooks/use-super-admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function AdminAnnouncements() {
  const { 
    currentAnnouncement, 
    allAnnouncements, 
    isLoading,
    publish,
    deactivate,
  } = useAnnouncements();
  const { organizations, allUsers } = useSuperAdmin();

  const [formData, setFormData] = useState({
    message: '',
    buttonText: '',
    buttonUrl: '',
    showBanner: true,
    sendNotification: true,
    targetType: 'all' as 'all' | 'organizations' | 'admins' | 'specific',
    targetOrganizationIds: [] as string[],
    targetUserIds: [] as string[],
  });

  // Load current announcement data if exists
  useEffect(() => {
    if (currentAnnouncement) {
      setFormData({
        message: currentAnnouncement.message || '',
        buttonText: currentAnnouncement.button_text || '',
        buttonUrl: currentAnnouncement.button_url || '',
        showBanner: currentAnnouncement.show_banner ?? true,
        sendNotification: currentAnnouncement.send_notification ?? true,
        targetType: (currentAnnouncement.target_type as any) || 'all',
        targetOrganizationIds: currentAnnouncement.target_organization_ids || [],
        targetUserIds: currentAnnouncement.target_user_ids || [],
      });
    }
  }, [currentAnnouncement]);

  const handlePublish = async () => {
    await publish.mutateAsync(formData);
  };

  const handleDeactivate = async () => {
    if (currentAnnouncement) {
      await deactivate.mutateAsync(currentAnnouncement.id);
    }
  };

  const admins = allUsers?.filter(u => u.role === 'admin') || [];

  return (
    <AdminLayout title="Comunicados">
      <div className="space-y-6">
        {/* Current Announcement Status */}
        {currentAnnouncement && (
          <Card className="border-orange-500/50 bg-orange-50/50 dark:bg-orange-900/10">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-orange-600">
                  <Megaphone className="h-5 w-5" />
                  Comunicado Ativo
                </CardTitle>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleDeactivate}
                  disabled={deactivate.isPending}
                >
                  <X className="h-4 w-4 mr-1" />
                  Desativar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 md:px-6 pb-4">
              <p className="font-medium">{currentAnnouncement.message}</p>
              <div className="flex gap-2 mt-2">
                {currentAnnouncement.show_banner && (
                  <Badge variant="secondary">
                    <Eye className="h-3 w-3 mr-1" />
                    Barra visível
                  </Badge>
                )}
                {currentAnnouncement.send_notification && (
                  <Badge variant="secondary">
                    <Bell className="h-3 w-3 mr-1" />
                    Notificação enviada
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Publicado {formatDistanceToNow(new Date(currentAnnouncement.created_at!), { 
                  addSuffix: true,
                  locale: ptBR 
                })}
              </p>
            </CardContent>
          </Card>
        )}

        {/* New Announcement Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              {currentAnnouncement ? 'Atualizar Comunicado' : 'Novo Comunicado'}
            </CardTitle>
            <CardDescription>
              Envie uma mensagem para todos os usuários ou um grupo específico.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 md:px-6 pb-4 space-y-6">
            {/* Message */}
            <div className="space-y-2">
              <Label>Mensagem do Comunicado *</Label>
              <Textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="Nova atualização disponível! Confira as novidades do sistema."
                rows={3}
              />
            </div>

            {/* Button */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Texto do Botão (opcional)</Label>
                <Input
                  value={formData.buttonText}
                  onChange={(e) => setFormData({ ...formData, buttonText: e.target.value })}
                  placeholder="Saiba mais"
                />
              </div>
              <div className="space-y-2">
                <Label>Link do Botão (opcional)</Label>
                <Input
                  value={formData.buttonUrl}
                  onChange={(e) => setFormData({ ...formData, buttonUrl: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>

            {/* Display Options */}
            <div className="space-y-4">
              <Label className="text-base font-semibold">Opções de Exibição</Label>
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={formData.showBanner}
                    onCheckedChange={(checked) => setFormData({ ...formData, showBanner: checked })}
                  />
                  <div>
                    <Label>Exibir barra no topo</Label>
                    <p className="text-sm text-muted-foreground">
                      Mostra uma barra laranja fixa no topo de todas as páginas
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={formData.sendNotification}
                    onCheckedChange={(checked) => setFormData({ ...formData, sendNotification: checked })}
                  />
                  <div>
                    <Label>Enviar como notificação</Label>
                    <p className="text-sm text-muted-foreground">
                      Envia uma notificação para o sino de cada usuário
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Target Selection */}
            <div className="space-y-4">
              <Label className="text-base font-semibold">Destinatários</Label>
              <Select
                value={formData.targetType}
                onValueChange={(value: any) => setFormData({ 
                  ...formData, 
                  targetType: value,
                  targetOrganizationIds: [],
                  targetUserIds: [],
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Todos os usuários
                    </div>
                  </SelectItem>
                  <SelectItem value="admins">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Apenas administradores
                    </div>
                  </SelectItem>
                  <SelectItem value="organizations">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Organizações específicas
                    </div>
                  </SelectItem>
                  <SelectItem value="specific">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Usuários específicos
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Organization Selection */}
              {formData.targetType === 'organizations' && organizations && (
                <div className="max-h-48 overflow-y-auto border rounded-lg p-3 space-y-2">
                  {organizations.map((org) => (
                    <div key={org.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={formData.targetOrganizationIds.includes(org.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormData({
                              ...formData,
                              targetOrganizationIds: [...formData.targetOrganizationIds, org.id],
                            });
                          } else {
                            setFormData({
                              ...formData,
                              targetOrganizationIds: formData.targetOrganizationIds.filter(id => id !== org.id),
                            });
                          }
                        }}
                      />
                      <span className="text-sm">{org.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* User Selection */}
              {formData.targetType === 'specific' && admins && (
                <div className="max-h-48 overflow-y-auto border rounded-lg p-3 space-y-2">
                  {admins.map((user: any) => (
                    <div key={user.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={formData.targetUserIds.includes(user.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormData({
                              ...formData,
                              targetUserIds: [...formData.targetUserIds, user.id],
                            });
                          } else {
                            setFormData({
                              ...formData,
                              targetUserIds: formData.targetUserIds.filter(id => id !== user.id),
                            });
                          }
                        }}
                      />
                      <span className="text-sm">{user.name} ({user.email})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submit Button */}
            <Button 
              onClick={handlePublish}
              disabled={!formData.message || publish.isPending}
              className="w-full"
            >
              <Send className="h-4 w-4 mr-2" />
              {publish.isPending ? 'Enviando...' : 'Publicar Comunicado'}
            </Button>
          </CardContent>
        </Card>

        {/* Previous Announcements */}
        {allAnnouncements && allAnnouncements.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Comunicados</CardTitle>
              <CardDescription>
                Comunicados anteriores enviados pelo sistema
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 md:px-6 pb-4">
              <div className="space-y-3">
                {allAnnouncements.slice(0, 10).map((announcement) => (
                  <div 
                    key={announcement.id}
                    className="flex items-start justify-between p-3 border rounded-lg"
                  >
                    <div className="space-y-1">
                      <p className="text-sm">{announcement.message}</p>
                      <div className="flex gap-2">
                        {announcement.is_active ? (
                          <Badge className="bg-primary">Ativo</Badge>
                        ) : (
                          <Badge variant="outline">Inativo</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(announcement.created_at!), { 
                            addSuffix: true,
                            locale: ptBR 
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
