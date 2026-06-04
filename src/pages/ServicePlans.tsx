import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { 
  Plus, 
  Search, 
  Wifi, 
  Smartphone, 
  Building2, 
  Package,
  Loader2
} from 'lucide-react';
import { PlanCard } from '@/components/plans/PlanCard';
import { PlanFormDialog } from '@/components/plans/PlanFormDialog';
import { 
  useServicePlans, 
  useCreateServicePlan, 
  useUpdateServicePlan, 
  useDeleteServicePlan,
  type ServicePlan 
} from '@/hooks/use-service-plans';
import { ModuleGuard } from '@/components/guards/ModuleGuard';
import { useUserPermissions } from '@/hooks/use-user-permissions';

export default function ServicePlans() {
  const { hasPermission } = useUserPermissions();
  const canEdit = hasPermission('plans_edit');
  const { data: plans = [], isLoading } = useServicePlans();
  const createPlan = useCreateServicePlan();
  const updatePlan = useUpdateServicePlan();
  const deletePlan = useDeleteServicePlan();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ServicePlan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<ServicePlan | null>(null);

  // Filtrar planos
  const filteredPlans = plans.filter(plan => {
    const matchesSearch = 
      plan.name.toLowerCase().includes(search.toLowerCase()) ||
      plan.code.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || plan.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Estatísticas
  const stats = {
    total: plans.length,
    pf: plans.filter(p => p.category === 'PF').length,
    pj: plans.filter(p => p.category === 'PJ').length,
    movel: plans.filter(p => p.category === 'MOVEL').length,
    adicional: plans.filter(p => p.category === 'ADICIONAL').length,
  };

  const handleEdit = (plan: ServicePlan) => {
    setEditingPlan(plan);
    setFormOpen(true);
  };

  const handleDelete = (plan: ServicePlan) => {
    setDeletingPlan(plan);
  };

  const confirmDelete = async () => {
    if (deletingPlan) {
      await deletePlan.mutateAsync(deletingPlan.id);
      setDeletingPlan(null);
    }
  };

  const handleSubmit = async (data: Parameters<typeof createPlan.mutateAsync>[0]) => {
    if (editingPlan) {
      await updatePlan.mutateAsync({ id: editingPlan.id, ...data });
    } else {
      await createPlan.mutateAsync(data);
    }
    setFormOpen(false);
    setEditingPlan(null);
  };

  return (
    <ModuleGuard module="plans">
      <AppLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold">Planos de Serviço</h1>
              <p className="text-muted-foreground">
                Gerencie os planos de internet e serviços da sua empresa
              </p>
            </div>
            {canEdit && (
              <Button onClick={() => { setEditingPlan(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Plano
              </Button>
            )}
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-3 pt-4 px-4">
                <CardDescription>Total</CardDescription>
                <CardTitle className="text-2xl">{stats.total}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3 pt-4 px-4">
                <div className="flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-blue-500" />
                  <CardDescription>Pessoa Física</CardDescription>
                </div>
                <CardTitle className="text-2xl">{stats.pf}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3 pt-4 px-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-purple-500" />
                  <CardDescription>Pessoa Jurídica</CardDescription>
                </div>
                <CardTitle className="text-2xl">{stats.pj}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3 pt-4 px-4">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-green-500" />
                  <CardDescription>Móvel</CardDescription>
                </div>
                <CardTitle className="text-2xl">{stats.movel}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3 pt-4 px-4">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-orange-500" />
                  <CardDescription>Adicional</CardDescription>
                </div>
                <CardTitle className="text-2xl">{stats.adicional}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar planos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
              <TabsList>
                <TabsTrigger value="all">Todos</TabsTrigger>
                <TabsTrigger value="PF">PF</TabsTrigger>
                <TabsTrigger value="PJ">PJ</TabsTrigger>
                <TabsTrigger value="MOVEL">Móvel</TabsTrigger>
                <TabsTrigger value="ADICIONAL">Adicional</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Plans Grid */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredPlans.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Package className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Nenhum plano encontrado</h3>
                <p className="text-muted-foreground text-sm">
                  {search ? 'Tente outra busca' : 'Comece cadastrando seu primeiro plano'}
                </p>
                {canEdit && !search && (
                  <Button 
                    className="mt-4" 
                    onClick={() => { setEditingPlan(null); setFormOpen(true); }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Plano
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredPlans.map(plan => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  onEdit={canEdit ? handleEdit : undefined}
                  onDelete={canEdit ? handleDelete : undefined}
                />
              ))}
            </div>
          )}
        </div>

        {/* Form Dialog */}
        <PlanFormDialog
          open={formOpen}
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) setEditingPlan(null);
          }}
          plan={editingPlan}
          onSubmit={handleSubmit}
          isLoading={createPlan.isPending || updatePlan.isPending}
        />

        {/* Delete Confirmation */}
        <AlertDialog open={!!deletingPlan} onOpenChange={() => setDeletingPlan(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir plano?</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir o plano "{deletingPlan?.name}"? 
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AppLayout>
    </ModuleGuard>
  );
}
