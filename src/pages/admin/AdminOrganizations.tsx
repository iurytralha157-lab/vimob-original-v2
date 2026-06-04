import { useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  Eye,
  EyeOff,
  Building2,
} from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useSuperAdmin } from '@/hooks/use-super-admin';
import { useAdminPlans } from '@/hooks/use-admin-plans';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { 
  useAdminOrganizationsList, 
  useAdminOrganizationActions 
} from '@/hooks/use-admin-organizations';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger } from
'@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle } from
'@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { OrganizationCard } from '@/components/admin/organizations/OrganizationCard';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AdminOrganizations() {
  const navigate = useNavigate();
  const { startImpersonate } = useAuth();
  
  // Filters state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [segmentFilter, setSegmentFilter] = useState('all');

  // Queries & Mutations
  const { data: organizations, isLoading } = useAdminOrganizationsList({
    search,
    status: statusFilter,
    segment: segmentFilter
  });
  
  const { toggleStatus } = useAdminOrganizationActions();
  const { createOrganization, deleteOrganization } = useSuperAdmin();
  const { plans } = useAdminPlans();

  // Modal states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<{id: string; name: string;} | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [newOrg, setNewOrg] = useState({
    name: '',
    segment: 'imobiliario' as 'imobiliario' | 'telecom' | 'servicos' | 'engenharia',
    adminEmail: '',
    adminName: '',
    adminPassword: '',
    planId: ''
  });
  const [showPassword, setShowPassword] = useState(false);

  const handleCreateOrg = async () => {
    if (!newOrg.adminPassword || newOrg.adminPassword.length < 6) return;
    await createOrganization.mutateAsync(newOrg);
    setCreateDialogOpen(false);
    setNewOrg({ name: '', segment: 'imobiliario', adminEmail: '', adminName: '', adminPassword: '', planId: '' });
    setShowPassword(false);
  };

  const handleImpersonate = async (orgId: string, orgName: string) => {
    await startImpersonate(orgId, orgName);
    navigate('/dashboard');
  };

  const handleToggleActive = (orgId: string, currentActive: boolean) => {
    toggleStatus.mutate({ id: orgId, isActive: !currentActive });
  };

  const handleDeleteOrg = async () => {
    if (orgToDelete && deleteConfirmation === orgToDelete.name) {
      await deleteOrganization.mutateAsync(orgToDelete.id);
      setDeleteDialogOpen(false);
      setOrgToDelete(null);
      setDeleteConfirmation('');
    }
  };

  return (
    <AdminLayout title="Organizações">
      <div className="space-y-6">
        {/* Advanced Header / Filters */}
        <div className="flex flex-col lg:flex-row gap-4 justify-between bg-card p-4 rounded-lg border border-border/60">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email ou CNPJ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background/50 border-border/50 rounded-lg" />
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] bg-background/50 border-border/50 rounded-lg">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Status</SelectItem>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="suspended">Suspensos</SelectItem>
                  <SelectItem value="inactive">Inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Select value={segmentFilter} onValueChange={setSegmentFilter}>
              <SelectTrigger className="w-[160px] bg-background/50 border-border/50 rounded-lg">
                <SelectValue placeholder="Segmento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Segmentos</SelectItem>
                <SelectItem value="imobiliario">Imobiliária</SelectItem>
                <SelectItem value="telecom">Telecom</SelectItem>
                <SelectItem value="servicos">Serviços</SelectItem>
                <SelectItem value="engenharia">Engenharia</SelectItem>
              </SelectContent>
            </Select>

            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-lg bg-primary hover:bg-primary/90">
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Cliente
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg rounded-2xl">
                <DialogHeader>
                  <DialogTitle>Cadastrar Nova Organização</DialogTitle>
                  <DialogDescription>
                    Crie uma nova conta empresarial e o usuário administrador principal.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="orgName">Nome da Empresa</Label>
                      <Input
                        id="orgName"
                        value={newOrg.name}
                        onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
                        placeholder="Ex: Prime Imóveis Ltda"
                        className="rounded-xl" />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="segment">Segmento de Mercado</Label>
                      <Select 
                        value={newOrg.segment} 
                        onValueChange={(val: any) => setNewOrg({ ...newOrg, segment: val })}
                      >
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Selecione o segmento" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="imobiliario">Imobiliária</SelectItem>
                          <SelectItem value="telecom">Telecom / Internet</SelectItem>
                          <SelectItem value="servicos">Serviços Gerais</SelectItem>
                          <SelectItem value="engenharia">Engenharia / Obras</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="plan">Plano</Label>
                      <Select
                        value={newOrg.planId || 'none'}
                        onValueChange={(val) => setNewOrg({ ...newOrg, planId: val === 'none' ? '' : val })}
                      >
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Selecione o plano" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem plano</SelectItem>
                          {plans?.map((plan) => (
                            <SelectItem key={plan.id} value={plan.id}>
                              {plan.name} - {Number(plan.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="border-t border-border/50 my-4 pt-4">
                    <h4 className="text-sm font-bold mb-4">Dados do Administrador</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2 col-span-2">
                        <Label htmlFor="adminName">Nome Completo</Label>
                        <Input
                          id="adminName"
                          value={newOrg.adminName}
                          onChange={(e) => setNewOrg({ ...newOrg, adminName: e.target.value })}
                          placeholder="Ex: João da Silva"
                          className="rounded-xl" />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label htmlFor="adminEmail">Email de Acesso</Label>
                        <Input
                          id="adminEmail"
                          type="email"
                          value={newOrg.adminEmail}
                          onChange={(e) => setNewOrg({ ...newOrg, adminEmail: e.target.value })}
                          placeholder="joao@empresa.com"
                          className="rounded-xl" />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label htmlFor="adminPassword">Senha Inicial</Label>
                        <div className="relative">
                          <Input
                            id="adminPassword"
                            type={showPassword ? 'text' : 'password'}
                            value={newOrg.adminPassword}
                            onChange={(e) => setNewOrg({ ...newOrg, adminPassword: e.target.value })}
                            placeholder="Mínimo 6 caracteres"
                            className="pr-10 rounded-xl" />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setCreateDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    className="flex-[2] rounded-xl"
                    onClick={handleCreateOrg}
                    disabled={!newOrg.name || !newOrg.adminEmail || !newOrg.adminName || !newOrg.adminPassword || newOrg.adminPassword.length < 6 || createOrganization.isPending}>
                    {createOrganization.isPending ? 'Processando...' : 'Criar Organização'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Organizations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[280px] w-full rounded-lg" />
            ))
          ) : organizations?.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-muted-foreground space-y-4 bg-card/20 rounded-lg border border-dashed border-border">
              <Building2 className="h-12 w-12 opacity-20" />
              <p className="text-lg font-medium">Nenhuma organização encontrada com os filtros atuais.</p>
              <Button variant="link" onClick={() => { setSearch(''); setStatusFilter('all'); setSegmentFilter('all'); }}>
                Limpar filtros
              </Button>
            </div>
          ) : (
            organizations?.map((org) => (
              <OrganizationCard
                key={org.id}
                org={org}
                onImpersonate={handleImpersonate}
                onViewDetails={(id) => navigate(`/admin/organizations/${id}`)}
                onToggleStatus={handleToggleActive}
                onDelete={(id, name) => {
                  setOrgToDelete({ id, name });
                  setDeleteConfirmation('');
                  setDeleteDialogOpen(true);
                }}
              />
            ))
          )}
        </div>

        {/* Delete Confirmation */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="max-w-md rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-red-600">Excluir Organização permanentemente?</AlertDialogTitle>
              <AlertDialogDescription className="space-y-4">
                <p>
                  Atenção! Esta ação <strong>excluirá TODOS os dados</strong> da empresa {orgToDelete?.name}, incluindo usuários, leads, e histórico financeiro.
                </p>
                <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs space-y-1">
                  <p>• Usuários e permissões serão removidos</p>
                  <p>• Leads e histórico de vendas perdidos</p>
                  <p>• Documentos e arquivos apagados</p>
                </div>
                <div className="space-y-2 pt-2">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">Confirme digitando o nome da empresa:</Label>
                  <Input
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    placeholder={orgToDelete?.name}
                    className="border-red-200 focus-visible:ring-red-500 rounded-xl" />
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:gap-0">
              <AlertDialogCancel className="rounded-xl" onClick={() => {
                setOrgToDelete(null);
                setDeleteConfirmation('');
              }}>
                Manter Organização
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteOrg}
                disabled={deleteConfirmation !== orgToDelete?.name || deleteOrganization.isPending}
                className="bg-red-600 hover:bg-red-700 text-white rounded-xl">
                {deleteOrganization.isPending ? 'Excluindo...' : 'Sim, Excluir Tudo'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}
