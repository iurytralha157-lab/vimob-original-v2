import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Building2,
  Users,
  ArrowLeft,
  Eye,
  Save,
  Check,
  X,
  Mail,
  Copy,
  Trash2,
  UserPlus,
  MoreHorizontal
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useSuperAdmin } from '@/hooks/use-super-admin';
import { useAdminInvitations } from '@/hooks/use-admin-invitations';
import { useAdminPlans } from '@/hooks/use-admin-plans';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from '@/components/ui/select';
import { DEFAULT_ENABLED_MODULES } from '@/hooks/use-organization-modules';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger } from
'@/components/ui/dialog';

const ALL_MODULES = [
// Core
{ name: 'crm', label: 'CRM (Pipelines, Contatos)', category: 'core' },
{ name: 'financial', label: 'Financeiro (Dashboard, Contas, Contratos, Comissões)', category: 'core' },
{ name: 'whatsapp', label: 'WhatsApp', category: 'core' },
{ name: 'agenda', label: 'Agenda', category: 'core' },
{ name: 'tags', label: 'Tags', category: 'core' },
{ name: 'round_robin', label: 'Distribuição (Round Robin)', category: 'core' },
{ name: 'reports', label: 'Relatórios', category: 'core' },
// Imobiliário
{ name: 'properties', label: 'Imóveis', segment: 'imobiliario', category: 'segment' },
{ name: 'cadences', label: 'Cadências', segment: 'imobiliario', category: 'segment' },
{ name: 'performance', label: 'Performance de Corretores', segment: 'imobiliario', category: 'segment' },
{ name: 'gamification', label: 'Gamificação', segment: 'imobiliario', category: 'segment' },
{ name: 'site', label: 'Site Integrado', segment: 'imobiliario', category: 'segment' },
// Telecom
{ name: 'plans', label: 'Planos de Serviços', segment: 'telecom', category: 'segment' },
{ name: 'coverage', label: 'Áreas de Cobertura', segment: 'telecom', category: 'segment' },
{ name: 'telecom', label: 'Clientes Telecom', segment: 'telecom', category: 'segment' },
// Avançado
{ name: 'automations', label: 'Automações', category: 'advanced' },
{ name: 'wordpress', label: 'Integração WordPress', category: 'advanced' },
{ name: 'webhooks', label: 'Webhooks', category: 'advanced' },
{ name: 'ai_agent', label: 'Agente de IA (WhatsApp)', category: 'advanced' },
{ name: 'campaigns', label: 'Campanhas (Dashboard Meta)', category: 'advanced' },
{ name: 'engineering', label: 'Engenharia e Obras', category: 'advanced' },
{ name: 'api', label: 'API Pública (Imóveis)', category: 'advanced' }];


export default function AdminOrganizationDetail() {
  const { id } = useParams<{id: string;}>();
  const navigate = useNavigate();
  const { organizations, updateOrganization, updateModuleAccess } = useSuperAdmin();
  const { startImpersonate } = useAuth();
  const { plans } = useAdminPlans();
  const {
    invitations,
    isLoading: loadingInvitations,
    createInvitation,
    deleteInvitation,
    getInviteLink
  } = useAdminInvitations(id);

  const org = organizations?.find((o) => o.id === id);

  const [formData, setFormData] = useState({
    name: '',
    subscription_status: 'trial',
    max_users: 10,
    admin_notes: '',
    plan_id: null as string | null,
    subscription_value: 0,
    billing_day: 1,
    next_billing_date: null as string | null,
    creci: '',
    max_whatsapp_sessions_override: null as number | null,
  });

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [newInvite, setNewInvite] = useState({
    email: '',
    role: 'user' as 'admin' | 'user'
  });

  // Fetch organization data directly to include all commercial fields
  const { data: orgDetails, refetch: refetchOrg } = useQuery({
    queryKey: ['org-details', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as any; // Bypass TS for dynamic fields
    },
    enabled: !!id
  });

  // Fetch organization modules
  const { data: modules, refetch: refetchModules } = useQuery({
    queryKey: ['org-modules', id],
    queryFn: async () => {
      if (!id) return [];
      const { data } = await supabase.
      from('organization_modules').
      select('*').
      eq('organization_id', id);
      return data || [];
    },
    enabled: !!id
  });

  // Fetch organization users (via members table for accuracy)
  const { data: orgUsers, refetch: refetchUsers } = useQuery({
    queryKey: ['org-users', id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('organization_members')
        .select(`
          id,
          role,
          joined_at,
          users (
            id,
            name,
            email,
            role,
            is_active,
            avatar_url,
            phone,
            whatsapp,
            created_at
          )
        `)
        .eq('organization_id', id);
      
      if (error) throw error;
      
      // Flatten and sort by joined_at (seniority)
      return (data || [])
        .filter(m => !!m.users)
        .map(m => {
          const u = m.users as any;
          return { 
            ...u, 
            member_role: m.role, 
            member_id: m.id, 
            joined_at: m.joined_at 
          };
        })
        .sort((a, b) => new Date(a.joined_at || a.created_at).getTime() - new Date(b.joined_at || b.created_at).getTime());
    },
    enabled: !!id
  });

  const [editUserDialogOpen, setEditUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [addUserDialogOpen, setAddUserDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user' as 'admin' | 'user'
  });

  useEffect(() => {
    if (orgDetails) {
      setFormData({
        name: orgDetails.name || '',
        subscription_status: orgDetails.subscription_status || 'trial',
        max_users: orgDetails.max_users || 10,
        admin_notes: orgDetails.admin_notes || '',
        plan_id: orgDetails.plan_id || null,
        subscription_value: Number(orgDetails.subscription_value) || 0,
        billing_day: orgDetails.billing_day || 1,
        next_billing_date: orgDetails.next_billing_date || null,
        creci: orgDetails.creci || '',
        max_whatsapp_sessions_override: orgDetails.max_whatsapp_sessions_override ?? null,
      });
    }
  }, [orgDetails]);

  if (!org) {
    return (
      <AdminLayout title="Organização">
        <div className="text-center py-8 text-muted-foreground">
          Organização não encontrada
        </div>
      </AdminLayout>);

  }

  const syncModulesFromPlan = async (planId: string | null) => {
    if (!planId) return;
    const selectedPlan = plans?.find((p) => p.id === planId);
    if (!selectedPlan) return;

    const enabledModules = new Set(selectedPlan.modules || []);
    await Promise.all(
      ALL_MODULES.map((module) =>
        supabase
          .from('organization_modules')
          .upsert({
            organization_id: org.id,
            module_name: module.name,
            is_enabled: enabledModules.has(module.name),
          }, { onConflict: 'organization_id,module_name' })
      )
    );
  };

  const handleSave = async () => {
    await updateOrganization.mutateAsync({
      id: org.id,
      ...formData,
      next_billing_date: formData.next_billing_date || null,
    });
    await syncModulesFromPlan(formData.plan_id);
    await refetchModules();
    await refetchOrg();
  };

  const handlePlanChange = (planId: string) => {
    const selectedPlan = plans?.find(p => p.id === planId);
    if (!selectedPlan && planId === 'none') {
      setFormData(prev => ({
        ...prev,
        plan_id: null,
      }));
      return;
    }

    if (selectedPlan) {
      // Calculate billing day from creation date if not already set or default
      const createdAt = new Date(org.created_at);
      const day = createdAt.getDate();
      
      // Calculate next billing date (same day next month)
      const nextDate = new Date();
      nextDate.setDate(day);
      if (nextDate <= new Date()) {
        nextDate.setMonth(nextDate.getMonth() + 1);
      }

      setFormData(prev => ({
        ...prev,
        plan_id: planId,
        subscription_value: selectedPlan.price,
        max_users: selectedPlan.max_users || prev.max_users,
        billing_day: prev.billing_day || day,
        next_billing_date: nextDate.toISOString().split('T')[0]
      }));
    }
  };

  const handleImpersonate = () => {
    startImpersonate(org.id, org.name);
    navigate('/dashboard');
  };

  const isModuleEnabled = (moduleName: string) => {
    const module = modules?.find((m) => m.module_name === moduleName);
    if (module) return module.is_enabled;
    return DEFAULT_ENABLED_MODULES.includes(moduleName as any);
  };

  const handleModuleToggle = async (moduleName: string, enabled: boolean) => {
    await updateModuleAccess.mutateAsync({
      organizationId: org.id,
      moduleName,
      isEnabled: enabled
    });
    refetchModules();
  };

  const handleCreateInvite = async () => {
    if (!id || !newInvite.email) return;

    await createInvitation.mutateAsync({
      email: newInvite.email,
      role: newInvite.role,
      organizationId: id
    });

    setInviteDialogOpen(false);
    setNewInvite({ email: '', role: 'user' });
  };

  const handleAddUser = async () => {
    if (!id || !newUser.email || !newUser.password) return;

    try {
      const { data, error } = await supabase.functions.invoke('manage-user', {
        body: {
          action: 'create',
          organization_id: id,
          ...newUser
        }
      });

      if (error) throw error;
      
      if (data?.moved) {
        toast.success('Usuário já existia e foi vinculado a esta organização!');
      } else {
        toast.success('Usuário criado com sucesso!');
        
        // Send notification with credentials
        try {
          const { notificationService } = await import('@/services/NotificationService');
          await notificationService.send({
            eventKey: 'credentials_access',
            organizationId: id,
            recipient: newUser.email,
            variables: {
              user_name: newUser.name,
              email: newUser.email,
              password: newUser.password
            }
          });

          // Also send welcome notification
          await notificationService.send({
            eventKey: 'welcome_user',
            organizationId: id,
            userId: data.user?.id, // Use ID if available
            recipient: newUser.email,
            variables: {
              user_name: newUser.name,
              email: newUser.email
            }
          });
        } catch (err) {
          console.error('Credentials notification failed:', err);
        }
      }
      
      setAddUserDialogOpen(false);
      setNewUser({ name: '', email: '', password: '', role: 'user' });
      refetchUsers();
    } catch (error: any) {
      toast.error('Erro ao criar usuário: ' + error.message);
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    try {
      const { error } = await supabase.functions.invoke('manage-user', {
        body: {
          action: 'update',
          userId: editingUser.id,
          name: editingUser.name,
          email: editingUser.email,
          phone: editingUser.phone,
          whatsapp: editingUser.whatsapp,
          role: editingUser.member_role,
          is_active: editingUser.is_active
        }
      });

      if (error) throw error;

      toast.success('Usuário atualizado com sucesso!');
      setEditUserDialogOpen(false);
      setEditingUser(null);
      refetchUsers();
    } catch (error: any) {
      toast.error('Erro ao atualizar usuário: ' + error.message);
    }
  };

  const handleResetUserPassword = async () => {
    if (!editingUser || !newPassword) return;

    try {
      const { error } = await supabase.functions.invoke('manage-user', {
        body: {
          action: 'reset_password',
          userId: editingUser.id,
          password: newPassword
        }
      });

      if (error) throw error;

      toast.success('Senha alterada com sucesso!');
      setResetPasswordDialogOpen(false);
      setNewPassword('');
    } catch (error: any) {
      toast.error('Erro ao alterar senha: ' + error.message);
    }
  };

  const copyInviteLink = (token: string) => {
    navigator.clipboard.writeText(getInviteLink(token));
    toast.success('Link copiado para a área de transferência!');
  };

  return (
    <AdminLayout title={org.name}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => navigate('/admin/organizations')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <Button variant="outline" onClick={handleImpersonate} className="w-full sm:w-auto">
            <Eye className="h-4 w-4 mr-2" />
            Entrar como Admin
          </Button>
        </div>

        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="w-full flex-wrap h-auto gap-1">
            <TabsTrigger value="general" className="flex-1 sm:flex-none">Geral</TabsTrigger>
            <TabsTrigger value="modules" className="flex-1 sm:flex-none">Módulos</TabsTrigger>
            <TabsTrigger value="users" className="flex-1 sm:flex-none">Usuários</TabsTrigger>
            <TabsTrigger value="invites" className="flex-1 sm:flex-none">Convites</TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden">
                    {orgDetails?.logo_url ? (
                      <img src={orgDetails.logo_url} alt={orgDetails.name} className="h-full w-full object-contain p-1" />
                    ) : (
                      <Building2 className="h-6 w-6 text-primary" />
                    )}
                  </div>
                  Informações Gerais
                </CardTitle>
                <CardDescription>
                  Dados básicos da organização
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 md:px-6 pb-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome da Organização</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })} />

                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status da Assinatura</Label>
                    <Select
                      value={formData.subscription_status}
                      onValueChange={(value) => setFormData({ ...formData, subscription_status: value })}>

                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="trial">Trial</SelectItem>
                        <SelectItem value="active">Ativo</SelectItem>
                        <SelectItem value="suspended">Suspenso</SelectItem>
                        <SelectItem value="cancelled">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxUsers">Máximo de Usuários</Label>
                    <Input
                      id="maxUsers"
                      type="number"
                      value={formData.max_users}
                      onChange={(e) => setFormData({ ...formData, max_users: parseInt(e.target.value) || 10 })} />

                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxWhatsAppOverride">Limite de WhatsApps</Label>
                    <Input
                      id="maxWhatsAppOverride"
                      type="number"
                      min={0}
                      placeholder="Plano"
                      value={formData.max_whatsapp_sessions_override ?? ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        max_whatsapp_sessions_override: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value) || 0)
                      })} />
                    <p className="text-xs text-muted-foreground">Vazio segue o plano. 0 deixa sem limite.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Criado em</Label>
                    <Input
                      value={new Date(org.created_at).toLocaleDateString('pt-BR')}
                      disabled />
                  </div>

                  <div className="space-y-2">
                    <Label>CRECI</Label>
                    <Input
                      value={formData.creci}
                      placeholder="12345-F"
                      onChange={(e) => setFormData({ ...formData, creci: e.target.value })} />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Plano</Label>
                    <Select 
                      value={formData.plan_id || 'none'} 
                      onValueChange={handlePlanChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar Plano" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {plans?.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Valor da Assinatura (R$)</Label>
                    <Input 
                      type="number" 
                      value={formData.subscription_value} 
                      onChange={e => setFormData({...formData, subscription_value: Number(e.target.value)})} 
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Dia do Vencimento (Dia do mês)</Label>
                    <Input 
                      type="number" 
                      min={1} 
                      max={28} 
                      value={formData.billing_day} 
                      onChange={e => {
                        const day = Number(e.target.value);
                        const nextDate = new Date();
                        nextDate.setDate(day);
                        if (nextDate <= new Date()) {
                          nextDate.setMonth(nextDate.getMonth() + 1);
                        }
                        setFormData({...formData, billing_day: day, next_billing_date: nextDate.toISOString().split('T')[0]});
                      }} 
                    />
                    <p className="text-xs text-muted-foreground">O padrão é o dia da criação ({new Date(org.created_at).getDate()})</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Próxima Cobrança (Data de Vencimento)</Label>
                    <Input 
                      type="date" 
                      value={formData.next_billing_date} 
                      onChange={e => setFormData({...formData, next_billing_date: e.target.value})} 
                    />
                    <p className="text-xs text-muted-foreground">O sistema gerará cobranças automaticamente nesta data.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notas Internas</Label>
                  <Textarea
                    id="notes"
                    value={formData.admin_notes}
                    onChange={(e) => setFormData({ ...formData, admin_notes: e.target.value })}
                    placeholder="Anotações sobre este cliente..."
                    rows={4} />

                </div>
                <Button onClick={handleSave} disabled={updateOrganization.isPending}>
                  <Save className="h-4 w-4 mr-2" />
                  {updateOrganization.isPending ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Modules Tab */}
          <TabsContent value="modules" className="space-y-6">
            {/* Core Modules */}
            <Card>
              <CardHeader>
                <CardTitle>Módulos Principais</CardTitle>
                <CardDescription>
                  Funcionalidades essenciais do sistema
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 px-[10px]">
                  {ALL_MODULES.filter((m) => m.category === 'core').map((module) =>
                  <div key={module.name} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg gap-3">
                      <div>
                        <p className="font-medium">{module.label}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isModuleEnabled(module.name) ?
                      <Badge className="bg-green-500">
                            <Check className="h-3 w-3 mr-1" />
                            Habilitado
                          </Badge> :

                      <Badge variant="outline" className="text-gray-500">
                            <X className="h-3 w-3 mr-1" />
                            Desabilitado
                          </Badge>
                      }
                        <Switch
                        checked={isModuleEnabled(module.name)}
                        onCheckedChange={(checked) => handleModuleToggle(module.name, checked)} />

                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Segment Modules */}
            <Card>
              <CardHeader>
                <CardTitle>Módulos por Segmento</CardTitle>
                <CardDescription>
                  Funcionalidades específicas para Imobiliário ou Telecom
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 md:px-6 pb-4">
                <div className="space-y-3">
                  {ALL_MODULES.filter((m) => m.category === 'segment').map((module) =>
                  <div key={module.name} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg gap-3">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{module.label}</p>
                        {'segment' in module && module.segment &&
                      <Badge variant="outline" className="text-xs">
                            {module.segment === 'imobiliario' ? 'Imobiliário' : module.segment === 'telecom' ? 'Telecom' : 'Engenharia'}
                          </Badge>
                      }
                      </div>
                      <div className="flex items-center gap-2">
                        {isModuleEnabled(module.name) ?
                      <Badge className="bg-green-500">
                            <Check className="h-3 w-3 mr-1" />
                            Habilitado
                          </Badge> :

                      <Badge variant="outline" className="text-gray-500">
                            <X className="h-3 w-3 mr-1" />
                            Desabilitado
                          </Badge>
                      }
                        <Switch
                        checked={isModuleEnabled(module.name)}
                        onCheckedChange={(checked) => handleModuleToggle(module.name, checked)} />

                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Advanced Modules */}
            <Card>
              <CardHeader>
                <CardTitle>Módulos Avançados</CardTitle>
                <CardDescription>
                  Automações e integrações externas
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 md:px-6 pb-4">
                <div className="space-y-3">
                  {ALL_MODULES.filter((m) => m.category === 'advanced').map((module) =>
                  <div key={module.name} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg gap-3">
                      <div>
                        <p className="font-medium">{module.label}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isModuleEnabled(module.name) ?
                      <Badge className="bg-green-500">
                            <Check className="h-3 w-3 mr-1" />
                            Habilitado
                          </Badge> :

                      <Badge variant="outline" className="text-gray-500">
                            <X className="h-3 w-3 mr-1" />
                            Desabilitado
                          </Badge>
                      }
                        <Switch
                        checked={isModuleEnabled(module.name)}
                        onCheckedChange={(checked) => handleModuleToggle(module.name, checked)} />

                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle>Usuários da Organização</CardTitle>
                  <CardDescription>
                    {orgUsers?.length || 0} usuários cadastrados
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setAddUserDialogOpen(true)}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Adicionar Usuário
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 md:px-6 pb-4">
                {orgUsers?.length === 0 ?
                <div className="text-center py-8 text-muted-foreground">
                    Nenhum usuário cadastrado
                  </div> :

                <div className="space-y-2">
                    {orgUsers?.map((user, index) =>
                  <div key={user.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg hover:bg-muted/5 transition-colors gap-3">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Users className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{user.name}</p>
                              {index === 0 && user.member_role === 'admin' && (
                                <Badge className="bg-amber-500 hover:bg-amber-600">
                                  Responsável
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={user.member_role === 'admin' ? 'default' : 'secondary'}>
                            {user.member_role === 'admin' ? 'Administrador' : 'Usuário'}
                          </Badge>
                          {!user.is_active &&
                            <Badge variant="outline" className="text-gray-500">Inativo</Badge>
                          }
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => {
                                setEditingUser(user);
                                setEditUserDialogOpen(true);
                              }}>
                                <Save className="h-4 w-4 mr-2" />
                                Editar Perfil
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                setEditingUser(user);
                                setResetPasswordDialogOpen(true);
                              }}>
                                <Check className="h-4 w-4 mr-2" />
                                Trocar Senha
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                  )}
                  </div>
                }
              </CardContent>
            </Card>

            {/* Add User Dialog */}
            <Dialog open={addUserDialogOpen} onOpenChange={setAddUserDialogOpen}>
              <DialogContent className="max-w-[95vw] sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Adicionar Usuário</DialogTitle>
                  <DialogDescription>
                    Criar um usuário diretamente nesta organização.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Nome Completo</Label>
                    <Input 
                      value={newUser.name} 
                      onChange={e => setNewUser({...newUser, name: e.target.value})}
                      placeholder="Ex: Maria Souza"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input 
                      type="email" 
                      value={newUser.email} 
                      onChange={e => setNewUser({...newUser, email: e.target.value})}
                      placeholder="usuario@email.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Senha Inicial</Label>
                    <Input 
                      type="password" 
                      value={newUser.password} 
                      onChange={e => setNewUser({...newUser, password: e.target.value})}
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Função</Label>
                    <Select value={newUser.role} onValueChange={(v: any) => setNewUser({...newUser, role: v})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">Usuário Comum</SelectItem>
                        <SelectItem value="admin">Administrador</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddUserDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={handleAddUser} disabled={!newUser.email || !newUser.password}>Criar Usuário</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Edit User Dialog */}
            <Dialog open={editUserDialogOpen} onOpenChange={setEditUserDialogOpen}>
              <DialogContent className="max-w-[95vw] sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Editar Perfil</DialogTitle>
                </DialogHeader>
                {editingUser && (
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Nome</Label>
                      <Input 
                        value={editingUser.name} 
                        onChange={e => setEditingUser({...editingUser, name: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input 
                        value={editingUser.email} 
                        onChange={e => setEditingUser({...editingUser, email: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Telefone</Label>
                      <Input 
                        value={editingUser.phone || ''} 
                        onChange={e => setEditingUser({...editingUser, phone: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>WhatsApp</Label>
                      <Input 
                        value={editingUser.whatsapp || ''} 
                        onChange={e => setEditingUser({...editingUser, whatsapp: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Função</Label>
                      <Select value={editingUser.member_role} onValueChange={v => setEditingUser({...editingUser, member_role: v})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">Usuário</SelectItem>
                          <SelectItem value="admin">Administrador</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between space-x-2">
                      <Label>Conta Ativa</Label>
                      <Switch 
                        checked={editingUser.is_active} 
                        onCheckedChange={v => setEditingUser({...editingUser, is_active: v})}
                      />
                    </div>
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditUserDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={handleUpdateUser}>Salvar Alterações</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Reset Password Dialog */}
            <Dialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
              <DialogContent className="max-w-[95vw] sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Redefinir Senha</DialogTitle>
                  <DialogDescription>
                    Digite a nova senha para {editingUser?.name}.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Nova Senha</Label>
                    <Input 
                      type="password" 
                      value={newPassword} 
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setResetPasswordDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={handleResetUserPassword} disabled={!newPassword || newPassword.length < 6}>
                    Alterar Senha
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Invites Tab */}
          <TabsContent value="invites" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle>Convites Pendentes</CardTitle>
                  <CardDescription>
                    {invitations?.length || 0} convites ativos
                  </CardDescription>
                </div>
                <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Novo Convite
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="w-[90%] sm:max-w-md sm:w-full rounded-lg">
                    <DialogHeader>
                      <DialogTitle>Convidar Usuário</DialogTitle>
                      <DialogDescription>
                        Envie um convite para um novo usuário se juntar a esta organização.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="inviteEmail">Email</Label>
                        <Input
                          id="inviteEmail"
                          type="email"
                          value={newInvite.email}
                          onChange={(e) => setNewInvite({ ...newInvite, email: e.target.value })}
                          placeholder="usuario@email.com" />

                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="inviteRole">Função</Label>
                        <Select
                          value={newInvite.role}
                          onValueChange={(value: 'admin' | 'user') => setNewInvite({ ...newInvite, role: value })}>

                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">Usuário</SelectItem>
                            <SelectItem value="admin">Administrador</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-4">
                      <Button variant="outline" className="w-[40%] rounded-xl" onClick={() => setInviteDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button
                        className="w-[60%] rounded-xl"
                        onClick={handleCreateInvite}
                        disabled={!newInvite.email || createInvitation.isPending}>

                        {createInvitation.isPending ? 'Enviando...' : 'Criar Convite'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="px-4 md:px-6 pb-4">
                {loadingInvitations ?
                <div className="text-center py-8 text-muted-foreground">
                    Carregando...
                  </div> :
                invitations?.length === 0 ?
                <div className="text-center py-8 text-muted-foreground">
                    Nenhum convite pendente
                  </div> :

                <div className="space-y-2">
                    {invitations?.map((invite) =>
                  <div key={invite.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg gap-3">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Mail className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{invite.email}</p>
                            <p className="text-sm text-muted-foreground">
                              Expira em {formatDistanceToNow(new Date(invite.expires_at), {
                            addSuffix: false,
                            locale: ptBR
                          })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={invite.role === 'admin' ? 'default' : 'secondary'}>
                            {invite.role === 'admin' ? 'Administrador' : 'Usuário'}
                          </Badge>
                          <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyInviteLink(invite.token)}
                        title="Copiar link">

                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteInvitation.mutate(invite.id)}
                        title="Remover convite"
                        className="text-destructive hover:text-destructive">

                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                  )}
                  </div>
                }
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>);

}
