import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  Users,
  UserCheck,
  UserX,
  Clock,
  AlertTriangle,
  Pencil,
  Trash2,
  Loader2,
  Phone,
  Mail,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
} from 'lucide-react';
import { CustomerFormDialog } from '@/components/telecom/CustomerFormDialog';
import { 
  useTelecomCustomers, 
  useTelecomCustomerStats,
  useCreateTelecomCustomer, 
  useUpdateTelecomCustomer, 
  useDeleteTelecomCustomer,
  TELECOM_CUSTOMER_STATUSES,
  type TelecomCustomer 
} from '@/hooks/use-telecom-customers';
import { useServicePlans } from '@/hooks/use-service-plans';
import { useAuth } from '@/contexts/AuthContext';
import { ModuleGuard } from '@/components/guards/ModuleGuard';
import { cn } from '@/lib/utils';
import { useUserPermissions } from '@/hooks/use-user-permissions';

export default function TelecomCustomers() {
  const { profile } = useAuth();
  const { hasPermission } = useUserPermissions();
  const canEdit = hasPermission('customers_edit');
  const canViewAll = hasPermission('customers_view_all');
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [planFilter, setPlanFilter] = useState<string>('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const PAGE_SIZE_OPTIONS = [5, 10, 30, 50, 100];

  const { data: customers = [], isLoading } = useTelecomCustomers({
    search,
    status: statusFilter || undefined,
    plan_id: planFilter || undefined,
    page,
    limit: pageSize,
    canViewAll: canViewAll,
    currentUserId: profile?.id,
  });
  const { data: stats = { total: 0, instalados: 0, cancelados: 0, aguardando: 0, inadimplentes: 0 } } = useTelecomCustomerStats({
    canViewAll: canViewAll,
    currentUserId: profile?.id,
  });
  const { data: plans = [] } = useServicePlans();
  
  const createCustomer = useCreateTelecomCustomer();
  const updateCustomer = useUpdateTelecomCustomer();
  const deleteCustomer = useDeleteTelecomCustomer();

  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<TelecomCustomer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<TelecomCustomer | null>(null);

  const handleEdit = (customer: TelecomCustomer) => {
    setEditingCustomer(customer);
    setFormOpen(true);
  };

  const handleDelete = (customer: TelecomCustomer) => {
    setDeletingCustomer(customer);
  };

  const confirmDelete = async () => {
    if (deletingCustomer) {
      await deleteCustomer.mutateAsync(deletingCustomer.id);
      setDeletingCustomer(null);
    }
  };

  const handleSubmit = async (data: Parameters<typeof createCustomer.mutateAsync>[0]) => {
    if (editingCustomer) {
      await updateCustomer.mutateAsync({ id: editingCustomer.id, ...data });
    } else {
      await createCustomer.mutateAsync(data);
    }
    setFormOpen(false);
    setEditingCustomer(null);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = TELECOM_CUSTOMER_STATUSES.find(s => s.value === status);
    if (!statusConfig) return <Badge variant="outline">{status}</Badge>;
    
    return (
      <Badge className={cn(statusConfig.color, 'text-white')}>
        {statusConfig.label}
      </Badge>
    );
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return '-';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Client-side pagination
  const totalPages = Math.ceil(customers.length / pageSize);
  const paginatedCustomers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return customers.slice(start, start + pageSize);
  }, [customers, page, pageSize]);

  return (
    <ModuleGuard module="telecom">
      <AppLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold">Clientes</h1>
              <p className="text-muted-foreground">
                Gerencie os clientes de internet e telecom
              </p>
            </div>
            {canEdit && (
              <Button onClick={() => { setEditingCustomer(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Cliente
              </Button>
            )}
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <CardDescription>Total</CardDescription>
                </div>
                <CardTitle className="text-2xl">{stats.total}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-green-500" />
                  <CardDescription>Instalados</CardDescription>
                </div>
                <CardTitle className="text-2xl">{stats.instalados}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-yellow-500" />
                  <CardDescription>Aguardando</CardDescription>
                </div>
                <CardTitle className="text-2xl">{stats.aguardando}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  <CardDescription>Inadimplentes</CardDescription>
                </div>
                <CardTitle className="text-2xl">{stats.inadimplentes}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <UserX className="h-4 w-4 text-red-500" />
                  <CardDescription>Cancelados</CardDescription>
                </div>
                <CardTitle className="text-2xl">{stats.cancelados}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, telefone, email ou CPF/CNPJ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {TELECOM_CUSTOMER_STATUSES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={planFilter || "all"} onValueChange={(v) => setPlanFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Plano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os planos</SelectItem>
                {plans.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.code} - {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Customers Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : customers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Nenhum cliente encontrado</h3>
                <p className="text-muted-foreground text-sm">
                  {search || statusFilter || planFilter 
                    ? 'Tente ajustar os filtros' 
                    : 'Comece cadastrando seu primeiro cliente'}
                </p>
                {canEdit && !search && !statusFilter && !planFilter && (
                  <Button 
                    className="mt-4" 
                    onClick={() => { setEditingCustomer(null); setFormOpen(true); }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Cliente
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Localização</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedCustomers.map(customer => (
                      <TableRow key={customer.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{customer.name}</p>
                            {customer.cpf_cnpj && (
                              <p className="text-xs text-muted-foreground">{customer.cpf_cnpj}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {customer.phone && (
                              <div className="flex items-center gap-1 text-sm">
                                <Phone className="h-3 w-3 text-muted-foreground" />
                                {customer.phone}
                              </div>
                            )}
                            {customer.email && (
                              <div className="flex items-center gap-1 text-sm">
                                <Mail className="h-3 w-3 text-muted-foreground" />
                                {customer.email}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {customer.neighborhood && <p>{customer.neighborhood}</p>}
                            {customer.city && customer.uf && (
                              <p className="text-muted-foreground">{customer.city}/{customer.uf}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {customer.plan ? (
                            <Badge variant="outline" title={customer.plan.name}>
                              {customer.plan.code}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(customer.plan_value)}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(customer.status)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {canEdit && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEdit(customer)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDelete(customer)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

              {/* Pagination */}
              {totalPages > 0 && (
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground">
                      {customers.length} clientes • Página {page} de {totalPages}
                    </p>
                    <Select 
                      value={String(pageSize)} 
                      onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
                    >
                      <SelectTrigger className="h-8 w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZE_OPTIONS.map(size => (
                          <SelectItem key={size} value={String(size)}>
                            {size} por pág
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setPage(1)}
                        disabled={page === 1}
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setPage(totalPages)}
                        disabled={page === totalPages}
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Form Dialog */}
        <CustomerFormDialog
          open={formOpen}
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) setEditingCustomer(null);
          }}
          customer={editingCustomer}
          onSubmit={handleSubmit}
          isLoading={createCustomer.isPending || updateCustomer.isPending}
        />

        {/* Delete Confirmation */}
        <AlertDialog open={!!deletingCustomer} onOpenChange={() => setDeletingCustomer(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir o cliente "{deletingCustomer?.name}"? 
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
