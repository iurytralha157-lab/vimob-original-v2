import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Loader2, 
  Plus, 
  Trash2,
  MessageSquare,
  History,
  CheckCircle2,
  XCircle,
  Bell,
  ChevronDown,
  ChevronUp,
  Settings,
  Mail,
  Edit2,
  Save,
  Lightbulb,
  Clock
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { NotificationTemplate, NotificationChannel, notificationService } from '@/services/NotificationService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const EVENT_KEY_OPTIONS = [
  { value: 'deal_won', label: 'Lead Ganho (CRM)', category: 'Vendas' },
  { value: 'new_lead_received', label: 'Novo Lead (Automático)', category: 'Leads' },
  { value: 'lead_assigned_to_user', label: 'Lead Atribuido ao Responsavel', category: 'Leads' },
  { value: 'lead_transferred_to_user', label: 'Lead Transferido ao Responsavel', category: 'Leads' },
  { value: 'manual_lead_registered', label: 'Novo Lead (Manual)', category: 'Leads' },
  { value: 'lead_reentry', label: 'Reentrada de Lead', category: 'Leads' },
  { value: 'lead_duplicate_existing', label: 'Lead já cadastrado', category: 'Leads' },
  { value: 'lead_moved_system', label: 'Lead Movido', category: 'Leads' },
  { value: 'welcome_lead', label: 'Boas-vindas ao Lead', category: 'Leads' },
  { value: 'new_appointment', label: 'Novo Agendamento', category: 'Agenda' },
  { value: 'appointment_reminder', label: 'Lembrete de Agendamento', category: 'Agenda' },
  { value: 'ranking_update', label: 'Atualização de Ranking', category: 'Equipe' },
  { value: 'ranking_event', label: 'Evento de Gamificação', category: 'Equipe' },
  { value: 'gamification_update', label: 'Atualização de Gamificação', category: 'Equipe' },
  { value: 'credentials_access', label: 'Credenciais de Acesso', category: 'Sistema' },
  { value: 'welcome_user', label: 'Boas-vindas ao Sistema', category: 'Sistema' },
  { value: 'whatsapp_disconnected', label: 'WhatsApp Desconectado', category: 'WhatsApp' },
  { value: 'whatsapp_disconnected_admin', label: 'WhatsApp Desconectado (Admin)', category: 'WhatsApp' },
  { value: 'sla_warning', label: 'SLA Próximo do Limite', category: 'SLA' },
  { value: 'sla_overdue', label: 'SLA Vencido', category: 'SLA' },
  { value: 'sla_overdue_manager', label: 'SLA Vencido (Gestor)', category: 'SLA' },
  { value: 'automation_started', label: 'Automação Iniciada', category: 'Automação' },
  { value: 'automation_failed', label: 'Falha em Automação', category: 'Automação' },
  { value: 'automation_repeated_failures', label: 'Falhas Recorrentes em Automação', category: 'Automação' },
  { value: 'system_announcement', label: 'Comunicado do Sistema', category: 'Sistema' },
  { value: 'update_phone_reminder', label: 'Atualização de Telefone', category: 'Sistema' },
  { value: 'test_push', label: 'Teste de Push', category: 'Sistema' },
];

function getDispatchLogStatus(status: string | null | undefined) {
  switch (status) {
    case 'sent':
      return {
        label: 'Sucesso',
        className: 'bg-green-500/10 text-green-600',
        icon: CheckCircle2,
      };
    case 'queued':
      return {
        label: 'Enfileirado',
        className: 'bg-amber-500/10 text-amber-600',
        icon: Clock,
      };
    case 'failed':
    case 'error':
      return {
        label: 'Erro',
        className: 'bg-destructive/10 text-destructive',
        icon: XCircle,
      };
    default:
      return {
        label: status || 'Pendente',
        className: 'bg-muted text-muted-foreground',
        icon: Clock,
      };
  }
}

export function NotificationSettings({ filterSlug }: { filterSlug?: string }) {
  const { isSuperAdmin, user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [originalTemplates, setOriginalTemplates] = useState<NotificationTemplate[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [activeSubTab, setActiveSubTab] = useState('templates');
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<any>(null);
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);
  const [testOrgs, setTestOrgs] = useState<any[]>([]);
  const [testUsers, setTestUsers] = useState<any[]>([]);
  const [selectedTestOrgId, setSelectedTestOrgId] = useState<string>('');
  const [selectedTestUserId, setSelectedTestUserId] = useState<string>('');
  const [loadingTestUsers, setLoadingTestUsers] = useState(false);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    fetchData().then((unsubscribe) => {
      if (typeof unsubscribe === 'function') cleanup = unsubscribe;
    });
    loadTestConfig();

    return () => {
      cleanup?.();
    };
  }, []);

  const loadTestConfig = async () => {
    try {
      const saved = localStorage.getItem('notification_test_config');
      if (saved) {
        const { orgId, userId } = JSON.parse(saved);
        setSelectedTestOrgId(orgId);
        setSelectedTestUserId(userId);
        if (orgId) {
          fetchTestUsers(orgId);
        }
      }
      
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, name')
        .order('name');
      
      if (orgs) setTestOrgs(orgs);
    } catch (error) {
      console.error('Erro ao carregar config de teste:', error);
    }
  };

  const fetchTestUsers = async (orgId: string) => {
    setLoadingTestUsers(true);
    try {
      const { data } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('organization_id', orgId)
        .order('name');
      
      if (data) setTestUsers(data);
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
    } finally {
      setLoadingTestUsers(false);
    }
  };

  const handleSaveTestConfig = () => {
    if (!selectedTestOrgId || !selectedTestUserId) {
      toast.error('Selecione organização e usuário para o teste');
      return;
    }
    localStorage.setItem('notification_test_config', JSON.stringify({
      orgId: selectedTestOrgId,
      userId: selectedTestUserId
    }));
    toast.success('Configuração de teste salva!');
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: templatesData, error: templatesError } = await supabase
        .from('notification_templates' as any)
        .select('*')
        .order('name');
      
      if (templatesError) throw templatesError;
      let data = templatesData as any[] || [];
      if (filterSlug) {
        data = data.filter((t: any) => t.slug === filterSlug);
      }
      setTemplates(data);
      setOriginalTemplates(JSON.parse(JSON.stringify(data)));

      const { data: logsData, error: logsError } = await supabase
        .from('notification_logs')
        .select('*, template:notification_templates(name, slug), user:users(name, email)')
        .order('created_at', { ascending: false })
        .limit(200);
      
      if (logsError) throw logsError;
      setLogs(logsData || []);

      const { data: settingsData } = await supabase
        .from('notification_settings' as any)
        .select('*')
        .maybeSingle();
      
      if (settingsData) setSettings(settingsData);

      // Configurar canal em tempo real para o histórico
      const channel = supabase
        .channel('notification_logs_realtime')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notification_logs' },
          async (payload) => {
            // Busca os detalhes do novo log para manter a consistência do join
            const { data: newLog } = await supabase
              .from('notification_logs')
              .select('*, template:notification_templates(name, slug), user:users(name, email)')
              .eq('id', payload.new.id)
              .single();
            
            if (newLog) {
              setLogs(prev => [newLog, ...prev.slice(0, 199)]);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (error: any) {
      console.error('Erro ao buscar dados:', error);
      toast.error('Não foi possível carregar os templates. Verifique se as tabelas foram criadas.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplate = async (id: string) => {
    const template = templates.find(t => t.id === id);
    if (!template) return;

    setSaving(id);
    try {
      const { error } = await supabase
        .from('notification_templates' as any)
        .update({
          name: template.name,
          title: template.title,
          message: template.message,
          channel: template.channel,
          channels: template.channels,
          subject: template.subject,
          html_body: template.html_body,
          dedupe_window_seconds: template.dedupe_window_seconds,
          is_active: template.is_active,
          category: template.category,
          variables: template.variables,
          event_key: template.event_key
        })
        .eq('id', id);

      if (error) throw error;
      
      // Update original state to match current
      setOriginalTemplates(prev => prev.map(t => t.id === id ? { ...template } : t));
      setChangedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success('Template salvo com sucesso!');
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setSaving(null);
    }
  };

  const handleCancelEdit = (id: string) => {
    const original = originalTemplates.find(t => t.id === id);
    if (!original) return;

    setTemplates(prev => prev.map(t => t.id === id ? { ...original } : t));
    setChangedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleLocalUpdate = (id: string, updates: Partial<NotificationTemplate>) => {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    setChangedIds(prev => new Set(prev).add(id));
  };

  const handleAddTemplate = async () => {
    const timestamp = Date.now();
    const defaultName = 'Novo Template';
    const defaultEventKey = ''; // Inicia vazio para forçar seleção ou indicar que precisa configurar
    const defaultMessage = 'Olá {nome}, sua mensagem aqui.';
    
    const newTemplate = {
      name: defaultName,
      slug: `template_${timestamp}`,
      event_key: defaultEventKey,
      channel: 'system' as NotificationChannel,
      channels: ['system'],
      message: defaultMessage,
      subject: `Notificação: ${defaultName}`,
      html_body: defaultMessage,
      category: 'info',
      variables: ['nome'],
      is_active: true
    };

    try {
      const { data, error } = await supabase
        .from('notification_templates' as any)
        .insert([newTemplate])
        .select()
        .single();

      if (error) throw error;
      const created = data as any;
      setTemplates([created, ...templates]);
      setOriginalTemplates([JSON.parse(JSON.stringify(created)), ...originalTemplates]);
      setExpandedTemplateId(created.id); // Expandir automaticamente o novo template
      toast.success('Novo template criado! Selecione a chave do evento para configurar o disparo.');
    } catch (error: any) {
      toast.error('Erro ao criar template: ' + error.message);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este template?')) return;

    try {
      const { error } = await supabase
        .from('notification_templates' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;
      setTemplates(prev => prev.filter(t => t.id !== id));
      setOriginalTemplates(prev => prev.filter(t => t.id !== id));
      setChangedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success('Template removido.');
    } catch (error: any) {
      toast.error('Erro ao remover: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-[800px]">
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Histórico
          </TabsTrigger>
          <TabsTrigger value="test_settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configuração de Teste
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Configurações de E-mail
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-6 mt-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium">Templates de Notificações</h3>
              <p className="text-sm text-muted-foreground">Centralize e personalize todas as mensagens enviadas.</p>
            </div>
            <Button onClick={handleAddTemplate} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Novo Template
            </Button>
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {templates.length === 0 ? (
              <Card className="col-span-full py-12">
                <CardContent className="flex flex-col items-center justify-center text-center">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
                  <h3 className="text-lg font-medium">Nenhum template encontrado</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                    Certifique-se de que as tabelas foram criadas e que você tem permissão de acesso.
                  </p>
                  <Button variant="outline" onClick={fetchData} className="mt-4">
                    Tentar Novamente
                  </Button>
                </CardContent>
              </Card>
            ) : (
              templates.map((template) => {
                const isExpanded = expandedTemplateId === template.id;
                const activeChannels = template.channels || [template.channel];
                
                // Pre-fill logic for existing templates with empty fields
                const handleExpand = () => {
                  if (expandedTemplateId === template.id) {
                    setExpandedTemplateId(null);
                  } else {
                    setExpandedTemplateId(template.id);
                    
                    // Pre-fill logic if empty
                    const updates: Partial<NotificationTemplate> = {};
                    let hasUpdates = false;
                    
                    if (!template.event_key) {
                      updates.event_key = `evento_${template.slug || template.id.split('-')[0]}`;
                      hasUpdates = true;
                    }
                    if (!template.subject) {
                      updates.subject = `Notificação: ${template.name}`;
                      hasUpdates = true;
                    }
                    if (!template.html_body && template.message) {
                      updates.html_body = template.message;
                      hasUpdates = true;
                    }
                    
                    if (hasUpdates) {
                      handleLocalUpdate(template.id, updates);
                    }
                  }
                };

                return (
                  <Card key={template.id} className={cn(
                    "overflow-hidden transition-all border-2 mb-4",
                    changedIds.has(template.id) ? "border-primary shadow-sm" : "border-muted"
                  )}>
                    <div 
                      className={cn(
                        "p-4 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors",
                        isExpanded && "border-b bg-muted/20"
                      )}
                      onClick={handleExpand}
                    >
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold truncate">{template.name}</span>
                            <div className="flex gap-1 flex-wrap">
                              {activeChannels.map(ch => (
                                <Badge key={ch} variant="secondary" className="text-[10px] capitalize px-1.5 h-5">
                                  {ch === 'system' ? 'Sistema' : ch}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span>Slug: <code className="bg-muted px-1 rounded">{template.slug}</code></span>
                            {template.event_key && (
                              <span>Evento: <code className="text-primary font-medium">{template.event_key}</code></span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 ml-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2 pr-3 border-r mr-1">
                          <span className="text-[10px] text-muted-foreground hidden sm:inline">
                            {template.is_active ? 'Ativo' : 'Inativo'}
                          </span>
                          <Switch 
                            checked={template.is_active} 
                            onCheckedChange={(checked) => handleLocalUpdate(template.id, { is_active: checked })}
                          />
                        </div>
                        
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-destructive h-8 w-8 hover:bg-destructive/10" 
                          onClick={() => handleDeleteTemplate(template.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        
                        <Button 
                          variant={isExpanded ? "default" : "outline"}
                          size="sm"
                          className="h-8 text-xs gap-1.5"
                          onClick={handleExpand}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          {isExpanded ? "Fechar" : "Editar"}
                        </Button>
                      </div>
                    </div>

                    {isExpanded && (
                      <CardContent className="pt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase text-muted-foreground font-bold">Nome do Template</Label>
                              <Input 
                                value={template.name} 
                                onChange={(e) => handleLocalUpdate(template.id, { name: e.target.value })}
                                className="bg-background h-8 text-sm"
                              />
                            </div>
                            
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase text-muted-foreground font-bold">Chave do Evento (Disparo)</Label>
                              <div className="space-y-2">
                                <Select 
                                  value={EVENT_KEY_OPTIONS.some(o => o.value === template.event_key) ? template.event_key : 'custom'} 
                                  onValueChange={(val) => {
                                    if (val !== 'custom') {
                                      handleLocalUpdate(template.id, { event_key: val });
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-xs border-primary/30">
                                    <SelectValue placeholder="Selecione o disparo" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {EVENT_KEY_OPTIONS.map((opt) => (
                                      <SelectItem key={opt.value} value={opt.value}>
                                        <div className="flex flex-col py-0.5">
                                          <span className="text-[11px] font-medium leading-tight">{opt.label}</span>
                                          <span className="text-[9px] text-muted-foreground font-mono">{opt.value}</span>
                                        </div>
                                      </SelectItem>
                                    ))}
                                    <SelectItem value="custom" className="text-primary font-medium">Outro (digitar manualmente)</SelectItem>
                                  </SelectContent>
                                </Select>

                                {(!EVENT_KEY_OPTIONS.some(o => o.value === template.event_key) || template.event_key === 'custom') && (
                                  <Input 
                                    value={template.event_key === 'custom' ? '' : (template.event_key || '')} 
                                    onChange={(e) => handleLocalUpdate(template.id, { event_key: e.target.value })}
                                    className="bg-background border-dashed h-8 text-xs font-mono"
                                    placeholder="Digite a chave manual (ex: gatilho_especifico)"
                                  />
                                )}
                              </div>
                              {template.event_key && templates.some(t => t.id !== template.id && t.event_key === template.event_key && t.is_active) && (
                                <p className="text-[9px] text-amber-600 font-medium animate-pulse">
                                  Atenção: Já existe outro template ativo para este disparo.
                                </p>
                              )}
                              <p className="text-[9px] text-muted-foreground italic">Este é o ID que liga o código do sistema a este template.</p>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase text-muted-foreground font-bold">Canais de Envio</Label>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 p-2 border rounded-md bg-muted/10">
                                {['system', 'whatsapp', 'email', 'push'].map((ch) => (
                                  <div key={ch} className="flex items-center justify-between gap-2 p-0.5">
                                    <Label htmlFor={`ch-${template.id}-${ch}`} className="text-[11px] capitalize cursor-pointer">
                                      {ch === 'system' ? 'Sistema' : ch}
                                    </Label>
                                    <Switch 
                                      id={`ch-${template.id}-${ch}`}
                                      className="scale-75 origin-right"
                                      checked={(template.channels || []).includes(ch as any)}
                                      onCheckedChange={(checked) => {
                                        const current = template.channels || [];
                                        const next = checked 
                                          ? [...current, ch as any]
                                          : current.filter(c => c !== ch);
                                        handleLocalUpdate(template.id, { channels: next });
                                      }}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase text-muted-foreground font-bold">Janela de Deduplicação</Label>
                              <div className="flex items-center gap-2">
                                <Input 
                                  type="number"
                                  value={template.dedupe_window_seconds || 60} 
                                  onChange={(e) => handleLocalUpdate(template.id, { dedupe_window_seconds: parseInt(e.target.value) })}
                                  className="bg-background w-20 h-8 text-sm"
                                />
                                <span className="text-xs text-muted-foreground">segundos</span>
                              </div>
                              <p className="text-[9px] text-muted-foreground">Evita envios repetidos do mesmo evento.</p>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase text-muted-foreground font-bold">Título / Assunto (Push/Sistema)</Label>
                              <Input 
                                value={template.title || ''} 
                                onChange={(e) => handleLocalUpdate(template.id, { title: e.target.value })}
                                className="bg-background h-8 text-sm"
                                placeholder="Título da notificação"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase text-muted-foreground font-bold">Assunto do E-mail</Label>
                              <Input 
                                value={template.subject || ''} 
                                onChange={(e) => handleLocalUpdate(template.id, { subject: e.target.value })}
                                className="bg-background border-blue-100 h-8 text-sm"
                                placeholder="Assunto do e-mail"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase text-muted-foreground font-bold">Mensagem Principal (WhatsApp/Push)</Label>
                              <Textarea 
                                value={template.message} 
                                onChange={(e) => {
                                  handleLocalUpdate(template.id, { message: e.target.value });
                                  if (template.html_body === template.message || !template.html_body) {
                                    handleLocalUpdate(template.id, { html_body: e.target.value });
                                  }
                                }}
                                className="font-mono text-[11px] bg-background min-h-[80px] py-2 resize-none"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase text-muted-foreground font-bold">Corpo do E-mail (HTML)</Label>
                              <Textarea 
                                value={template.html_body || ''} 
                                onChange={(e) => handleLocalUpdate(template.id, { html_body: e.target.value })}
                                className="font-mono text-[10px] bg-background min-h-[80px] py-2 resize-none border-blue-100"
                                placeholder="<html>...</html>"
                              />
                            </div>

                            <div className="bg-muted/30 p-2 rounded-md border border-dashed">
                              <p className="text-[9px] text-muted-foreground mb-1 font-medium">Variáveis:</p>
                              <div className="flex flex-wrap gap-1">
                                {template.variables && template.variables.length > 0 ? (
                                  template.variables.map((v, i) => (
                                    <Badge key={i} variant="outline" className="text-[8px] h-4 font-mono bg-background px-1">
                                      {`{${v}}`}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-[8px] text-muted-foreground italic">Nenhuma variável</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-4 pt-4 border-t mt-2">
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="secondary" 
                              size="sm" 
                              onClick={async () => {
                                try {
                                  let targetData: { id: string, email?: string, whatsapp?: string, phone?: string, name?: string, organization_id?: string | null } | null = null;
                                  let targetOrgId: string | null = null;

                                  // Tenta carregar configuração de teste salva
                                  const saved = localStorage.getItem('notification_test_config');
                                  if (saved) {
                                    const { orgId, userId } = JSON.parse(saved);
                                    if (userId) {
                                      const { data: testUser } = await supabase
                                        .from('users')
                                        .select('id, email, whatsapp, phone, name, organization_id')
                                        .eq('id', userId)
                                        .maybeSingle();
                                      
                                      if (testUser) {
                                        targetData = testUser;
                                        targetOrgId = orgId || testUser.organization_id;
                                      }
                                    }
                                  }

                                  // Se não houver config salva, busca Super Admin como fallback
                                  if (!targetData) {
                                    const { data: superAdmin } = await supabase
                                      .from('users')
                                      .select('id, email, whatsapp, phone, name, organization_id')
                                      .eq('role', 'super_admin')
                                      .order('created_at', { ascending: true })
                                      .limit(1)
                                      .maybeSingle();
                                    
                                    targetData = superAdmin;
                                  }
                                  
                                  if (!targetData && user) {
                                    // Fallback final para o usuário atual
                                    const { data: userProfile } = await supabase
                                      .from('users')
                                      .select('id, email, whatsapp, phone, name, organization_id')
                                      .eq('id', user.id)
                                      .single();
                                    targetData = userProfile;
                                  }

                                  if (!targetData) {
                                    toast.error('Nenhum usuário configurado para teste');
                                    return;
                                  }
                                  
                                  if (!targetOrgId) {
                                    targetOrgId = targetData.organization_id || profile?.organization_id;
                                  }
                                  
                                  if (!targetOrgId) {
                                    const { data: orgs } = await supabase.from('organizations').select('id').limit(1);
                                    if (orgs && orgs.length > 0) {
                                      targetOrgId = orgs[0].id;
                                    }
                                  }
                                  
                                  if (!targetOrgId) {
                                    toast.error('Nenhuma organização encontrada para o teste');
                                    return;
                                  }
                                  
                                  toast.promise(
                                    notificationService.send({
                                      eventKey: template.event_key || template.slug,
                                      organizationId: targetOrgId,
                                      userId: targetData.id,
                                      recipient: targetData.whatsapp || targetData.phone || targetData.email || undefined,
                                      variables: { 
                                        nome: targetData.name || 'Admin', 
                                        user_name: targetData.name || 'Admin',
                                        email: targetData.email || 'contato@exemplo.com.br',
                                        password: '********',
                                        lead: 'Teste de Notificação',
                                        lead_name: 'Lead de Teste',
                                        nome_lead: 'Lead de Teste',
                                        organization_name: 'Organização de Teste',
                                        source: 'Manual',
                                        from_stage: 'Novo',
                                        to_stage: 'Em Negociação',
                                        titulo: 'Visita Técnica',
                                        title: 'Visita Técnica',
                                        horario: '14:30',
                                        time: '14:30',
                                        date: '17/05/2026',
                                        data: '17/05/2026',
                                        position: '1º',
                                        total_sales: '12',
                                        last_lead: 'Casa de Praia'
                                      },
                                      isTest: true
                                    }),
                                    {
                                      loading: 'Enviando teste...',
                                      success: 'Teste enviado!',
                                      error: 'Falha no teste.'
                                    }
                                  );
                                } catch (error) {
                                  console.error('Erro ao testar envio:', error);
                                  toast.error('Erro ao buscar destinatário do teste');
                                }
                              }}
                              className="h-9 gap-2"
                            >
                              <Bell className="h-4 w-4" />
                              Testar Envio
                            </Button>
                          </div>

                          <div className="flex items-center gap-3">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleCancelEdit(template.id)}
                              disabled={saving === template.id || !changedIds.has(template.id)}
                              className="h-9"
                            >
                              Descartar
                            </Button>
                            <Button 
                              size="sm" 
                              onClick={() => handleSaveTemplate(template.id)}
                              disabled={saving === template.id || !changedIds.has(template.id)}
                              className={cn(
                                "gap-2 h-9 px-6",
                                changedIds.has(template.id) ? "bg-primary shadow-sm" : ""
                              )}
                            >
                              {saving === template.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                              Salvar Alterações
                            </Button>
                            
                            {!changedIds.has(template.id) && (
                              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 text-green-600 text-[10px] font-medium border border-green-200/50">
                                <CheckCircle2 className="h-3 w-3" />
                                Sincronizado
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Logs de Disparo</CardTitle>
              <CardDescription>Acompanhe em tempo real as notificações enviadas pelo sistema.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Data/Hora</th>
                      <th className="px-4 py-3 text-left font-medium">Template</th>
                      <th className="px-4 py-3 text-left font-medium">Canal</th>
                      <th className="px-4 py-3 text-left font-medium">Destinatário</th>
                      <th className="px-4 py-3 text-left font-medium">Status</th>
                      <th className="px-4 py-3 text-left font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length > 0 ? (
                      logs.map((log) => {
                        const statusMeta = getDispatchLogStatus(log.status);
                        const StatusIcon = statusMeta.icon;

                        return (
                        <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            <div className="flex flex-col">
                              <span>{format(new Date(log.created_at), 'dd/MM HH:mm', { locale: ptBR })}</span>
                              {log.is_test && (
                                <Badge variant="secondary" className="w-fit text-[8px] h-3 px-1 mt-0.5 bg-blue-100 text-blue-600 border-blue-200">TESTE</Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium">{log.template?.name || 'Manual / Sistema'}</div>
                            <div className="text-[10px] text-muted-foreground">{log.template?.slug || 'N/A'}</div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="capitalize text-[10px]">
                              {log.channel === 'system' ? 'Sistema' : log.channel}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">{log.user?.name || log.recipient || 'N/A'}</span>
                              {log.user?.email && <span className="text-[10px] opacity-70">{log.user.email}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${statusMeta.className} w-fit`}>
                                <StatusIcon className="h-3 w-3" />
                                <span className="text-[10px] font-medium">{statusMeta.label}</span>
                              </div>
                              {log.payload?.executionTime && (
                                <span className="text-[9px] text-muted-foreground font-mono">
                                  ({log.payload.executionTime})
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 text-[10px] gap-1"
                              onClick={() => {
                                console.log('Log details:', log);
                                alert(`Payload: ${JSON.stringify(log.payload, null, 2)}\n\nResponse: ${JSON.stringify(log.response, null, 2)}`);
                              }}
                            >
                              Detalhes
                            </Button>
                          </td>
                        </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                          Nenhum disparo registrado recentemente.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="test_settings" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                <CardTitle>Configuração de Teste de Notificações</CardTitle>
              </div>
              <CardDescription>
                Defina o destinatário padrão para todas as notificações enviadas via botão "Testar Envio".
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                <div className="space-y-2">
                  <Label>Organização de Teste</Label>
                  <Select 
                    value={selectedTestOrgId} 
                    onValueChange={(val) => {
                      setSelectedTestOrgId(val);
                      setSelectedTestUserId('');
                      fetchTestUsers(val);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a Organização" />
                    </SelectTrigger>
                    <SelectContent>
                      {testOrgs.map(org => (
                        <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Usuário de Teste</Label>
                  <Select 
                    value={selectedTestUserId} 
                    onValueChange={setSelectedTestUserId}
                    disabled={!selectedTestOrgId || loadingTestUsers}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={loadingTestUsers ? "Carregando..." : "Selecione o Usuário"} />
                    </SelectTrigger>
                    <SelectContent>
                      {testUsers.map(user => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">O usuário selecionado receberá as mensagens em todos os canais ativos no template.</p>
                </div>

                <Button 
                  onClick={handleSaveTestConfig} 
                  className="w-full"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Configuração de Teste
                </Button>
              </div>
            </CardContent>
          </Card>
          
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex gap-3">
            <Lightbulb className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold mb-1">Dica para Testes</p>
              <p>Após salvar esta configuração, vá para a aba <strong>Templates</strong> e clique em <strong>Testar Envio</strong> em qualquer template para verificar o formato e a entrega.</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Configurações de E-mail (Resend)</CardTitle>
              <CardDescription>Configure o remetente padrão e dados de integração do Resend.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Nome do Remetente</Label>
                  <Input 
                    value={settings?.from_name || ''} 
                    onChange={(e) => setSettings({ ...settings, from_name: e.target.value })}
                    placeholder="ex: Vimob"
                  />
                </div>
                <div className="space-y-2">
                  <Label>E-mail do Remetente</Label>
                  <Input 
                    value={settings?.from_email || ''} 
                    onChange={(e) => setSettings({ ...settings, from_email: e.target.value })}
                    placeholder="ex: notificacoes@seudominio.com.br"
                  />
                  <p className="text-[10px] text-muted-foreground">O domínio deve estar verificado no Resend.</p>
                </div>
                <div className="space-y-2">
                  <Label>Reply-To (E-mail de resposta)</Label>
                  <Input 
                    value={settings?.reply_to || ''} 
                    onChange={(e) => setSettings({ ...settings, reply_to: e.target.value })}
                    placeholder="ex: contato@seudominio.com.br"
                  />
                </div>
              </div>
              <div className="pt-4 border-t">
                <Button 
                  onClick={async () => {
                    const { error } = await supabase
                      .from('notification_settings' as any)
                      .upsert({
                        organization_id: profile?.organization_id || user?.user_metadata?.organization_id,
                        from_name: settings.from_name,
                        from_email: settings.from_email,
                        reply_to: settings.reply_to,
                        updated_at: new Date().toISOString()
                      });
                    if (error) toast.error('Erro ao salvar: ' + error.message);
                    else toast.success('Configurações salvas!');
                  }}
                >
                  Salvar Configurações
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
