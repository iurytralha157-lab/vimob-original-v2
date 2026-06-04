import { useState } from 'react';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Package,
  Check,
  X,
  DollarSign,
  Users,
  Clock,
  Layers
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminPlans, SubscriptionPlan } from '@/hooks/use-admin-plans';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const AVAILABLE_MODULES = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'leads', label: 'Leads' },
  { value: 'contacts', label: 'Contatos' },
  { value: 'pipelines', label: 'Pipelines' },
  { value: 'automations', label: 'Automações' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'financial', label: 'Financeiro' },
  { value: 'properties', label: 'Imóveis' },
  { value: 'agenda', label: 'Agenda' },
  { value: 'reports', label: 'Relatórios' },
  { value: 'site', label: 'Site Integrado' },
  { value: 'telecom', label: 'Telecom' },
  { value: 'engineering', label: 'Engenharia e Obras' },
];

const initialFormData = {
  name: '',
  description: '',
  price: 0,
  billing_cycle: 'monthly',
  trial_enabled: false,
  trial_days: 0,
  max_users: 10,
  max_whatsapp_sessions: 1,
  max_leads: null as number | null,
  modules: ['dashboard', 'leads', 'contacts'],
  is_active: true,
};

export default function AdminPlans() {
  const { plans, isLoading, createPlan, updatePlan, deletePlan } = useAdminPlans();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [formData, setFormData] = useState(initialFormData);

  const handleOpenDialog = (plan?: SubscriptionPlan) => {
    if (plan) {
      setEditingPlan(plan);
      setFormData({
        name: plan.name,
        description: plan.description || '',
        price: plan.price,
        billing_cycle: plan.billing_cycle,
        trial_enabled: plan.trial_enabled ?? plan.trial_days > 0,
        trial_days: plan.trial_days,
        max_users: plan.max_users,
        max_whatsapp_sessions: plan.max_whatsapp_sessions ?? 1,
        max_leads: plan.max_leads,
        modules: plan.modules || [],
        is_active: plan.is_active,
      });
    } else {
      setEditingPlan(null);
      setFormData(initialFormData);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (editingPlan) {
      await updatePlan.mutateAsync({ id: editingPlan.id, ...formData });
    } else {
      await createPlan.mutateAsync(formData);
    }
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (planToDelete) {
      await deletePlan.mutateAsync(planToDelete);
      setDeleteDialogOpen(false);
      setPlanToDelete(null);
    }
  };

  const toggleModule = (module: string) => {
    setFormData(prev => ({
      ...prev,
      modules: prev.modules.includes(module)
        ? prev.modules.filter(m => m !== module)
        : [...prev.modules, module],
    }));
  };

  return (
    <AdminLayout title="Planos de Assinatura">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div>
            <p className="text-muted-foreground">
              Gerencie os planos disponíveis para as organizações.
            </p>
          </div>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Plano
          </Button>
        </div>

        {/* Plans Grid */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            Carregando planos...
          </div>
        ) : plans?.length === 0 ? (
          <Card>
            <CardContent className="px-4 md:px-6 py-12 text-center text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum plano cadastrado.</p>
              <Button onClick={() => handleOpenDialog()} className="mt-4">
                Criar primeiro plano
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans?.map((plan) => (
              <Card key={plan.id} className={`relative ${!plan.is_active ? 'opacity-60' : ''}`}>
                {!plan.is_active && (
                  <Badge variant="outline" className="absolute top-4 right-4">
                    Inativo
                  </Badge>
                )}
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" />
                    {plan.name}
                  </CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="px-4 md:px-6 pb-4 space-y-4">
                  {/* Price */}
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">
                      R$ {plan.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-muted-foreground">
                      /{plan.billing_cycle === 'monthly' ? 'mês' : 'ano'}
                    </span>
                  </div>

                  {/* Features */}
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>Até {plan.max_users} usuários</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span>Até {plan.max_whatsapp_sessions ?? 1} WhatsApps</span>
                    </div>
                    {plan.trial_enabled && plan.trial_days > 0 && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{plan.trial_days} dias de trial</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-muted-foreground" />
                      <span>{plan.modules?.length || 0} módulos incluídos</span>
                    </div>
                  </div>

                  {/* Modules */}
                  <div className="flex flex-wrap gap-1">
                    {plan.modules?.slice(0, 4).map((module) => (
                      <Badge key={module} variant="secondary" className="text-xs">
                        {module}
                      </Badge>
                    ))}
                    {plan.modules?.length > 4 && (
                      <Badge variant="secondary" className="text-xs">
                        +{plan.modules.length - 4}
                      </Badge>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => handleOpenDialog(plan)}
                    >
                      <Edit2 className="h-4 w-4 mr-1" />
                      Editar
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        setPlanToDelete(plan.id);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingPlan ? 'Editar Plano' : 'Novo Plano'}
              </DialogTitle>
              <DialogDescription>
                Configure os detalhes do plano de assinatura.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label>Nome do Plano</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Profissional"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descrição curta do plano..."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Preço (R$)</Label>
                  <Input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Ciclo de Cobrança</Label>
                  <Select
                    value={formData.billing_cycle}
                    onValueChange={(value) => setFormData({ ...formData, billing_cycle: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Mensal</SelectItem>
                      <SelectItem value="yearly">Anual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2 col-span-2">
                  <Switch
                    checked={formData.trial_enabled}
                    onCheckedChange={(checked) => setFormData({
                      ...formData,
                      trial_enabled: checked,
                      trial_days: checked ? formData.trial_days : 0,
                    })}
                  />
                  <Label>Permitir teste/trial neste plano</Label>
                </div>

                <div className="space-y-2">
                  <Label>Dias de Trial</Label>
                  <Input
                    type="number"
                    min={0}
                    disabled={!formData.trial_enabled}
                    value={formData.trial_days}
                    onChange={(e) => setFormData({ ...formData, trial_days: parseInt(e.target.value) || 0 })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Máximo de Usuários</Label>
                  <Input
                    type="number"
                    value={formData.max_users}
                    onChange={(e) => setFormData({ ...formData, max_users: parseInt(e.target.value) || 1 })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Máximo de WhatsApps</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.max_whatsapp_sessions}
                    onChange={(e) => setFormData({ ...formData, max_whatsapp_sessions: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Módulos Incluídos</Label>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_MODULES.map((module) => (
                    <div
                      key={module.value}
                      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                        formData.modules.includes(module.value)
                          ? 'bg-primary/10 border-primary'
                          : 'hover:bg-muted'
                      }`}
                      onClick={() => toggleModule(module.value)}
                    >
                      {formData.modules.includes(module.value) ? (
                        <Check className="h-4 w-4 text-primary" />
                      ) : (
                        <X className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm">{module.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label>Plano ativo</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleSave}
                disabled={!formData.name || createPlan.isPending || updatePlan.isPending}
              >
                {createPlan.isPending || updatePlan.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Plano</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir este plano? Esta ação não pode ser desfeita.
                Organizações vinculadas a este plano perderão a referência.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}
