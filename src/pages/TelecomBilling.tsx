import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, DollarSign, Users, AlertTriangle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ModuleGuard } from '@/components/guards/ModuleGuard';
import { 
  useTelecomBilling, 
  useUpdateTelecomBilling,
  BILLING_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
} from '@/hooks/use-telecom-billing';
import { useTelecomCustomers } from '@/hooks/use-telecom-customers';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';

export default function TelecomBilling() {
  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(new Date()));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  const billingMonth = format(selectedMonth, 'yyyy-MM-01');
  
  const { data: billings = [], isLoading: loadingBillings } = useTelecomBilling({
    billing_month: billingMonth,
    payment_status: statusFilter || undefined,
  });
  
  const { data: customers = [], isLoading: loadingCustomers } = useTelecomCustomers({
    status: 'INSTALADOS', // Only active customers
    search: search || undefined,
  });
  
  const updateBilling = useUpdateTelecomBilling();

  const navigateMonth = (direction: 'prev' | 'next') => {
    setSelectedMonth(prev => 
      direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1)
    );
  };

  // Merge customers with their billing data for this month
  const customerBillingData = customers.map(customer => {
    const billing = billings.find(b => b.customer_id === customer.id);
    return {
      ...customer,
      billing_id: billing?.id,
      billing_status: billing?.billing_status || 'NAO_COBRADO',
      payment_status: billing?.payment_status || 'PENDENTE',
      billing_amount: billing?.amount || customer.plan_value,
    };
  });

  // Filter by search
  const filteredData = customerBillingData.filter(c => 
    !search || 
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  // Stats
  const stats = {
    total: filteredData.length,
    cobrados: filteredData.filter(c => c.billing_status === 'COBRADO').length,
    pagos: filteredData.filter(c => c.payment_status === 'PAGO').length,
    vencidos: filteredData.filter(c => c.payment_status === 'VENCIDO').length,
    totalValue: filteredData.reduce((sum, c) => sum + (c.billing_amount || 0), 0),
    receivedValue: filteredData
      .filter(c => c.payment_status === 'PAGO')
      .reduce((sum, c) => sum + (c.billing_amount || 0), 0),
  };

  const handleStatusChange = async (
    customerId: string, 
    billingId: string | undefined, 
    field: 'billing_status' | 'payment_status',
    value: string
  ) => {
    if (billingId) {
      await updateBilling.mutateAsync({
        id: billingId,
        [field]: value,
      });
    } else {
      // Create new billing record
      const customer = customers.find(c => c.id === customerId);
      
      await supabase.from('telecom_billing').insert({
        organization_id: customer?.organization_id,
        customer_id: customerId,
        billing_month: billingMonth,
        amount: customer?.plan_value,
        [field]: value,
      });
    }
  };

  const getStatusBadge = (status: string, options: readonly { value: string; label: string; color: string }[]) => {
    const option = options.find(o => o.value === status);
    return (
      <Badge className={cn('text-white', option?.color || 'bg-gray-500')}>
        {option?.label || status}
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

  return (
    <ModuleGuard module="telecom">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Controle de Cobranças</h1>
            <p className="text-muted-foreground">
              Gerencie as cobranças mensais dos clientes
            </p>
          </div>
          
          {/* Month Navigation */}
          <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
            <Button variant="ghost" size="icon" onClick={() => navigateMonth('prev')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-4 font-medium capitalize min-w-[140px] text-center">
              {format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <Button variant="ghost" size="icon" onClick={() => navigateMonth('next')}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Clientes</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">
                {stats.cobrados} cobrados
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pagos</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.pagos}</div>
              <p className="text-xs text-muted-foreground">
                {stats.total > 0 ? Math.round((stats.pagos / stats.total) * 100) : 0}% do total
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Vencidos</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.vencidos}</div>
              <p className="text-xs text-muted-foreground">
                Atenção necessária
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Recebido</CardTitle>
              <DollarSign className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(stats.receivedValue)}
              </div>
              <p className="text-xs text-muted-foreground">
                de {formatCurrency(stats.totalValue)} previsto
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status pagamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {PAYMENT_STATUS_OPTIONS.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status Cobrança</TableHead>
                  <TableHead>Status Pagamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(loadingBillings || loadingCustomers) ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Nenhum cliente encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map(customer => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell>{customer.phone || '-'}</TableCell>
                      <TableCell>{formatCurrency(customer.billing_amount)}</TableCell>
                      <TableCell>
                        <Select
                          value={customer.billing_status}
                          onValueChange={(v) => handleStatusChange(
                            customer.id, 
                            customer.billing_id, 
                            'billing_status', 
                            v
                          )}
                        >
                          <SelectTrigger className="w-[140px]">
                            {getStatusBadge(customer.billing_status, BILLING_STATUS_OPTIONS)}
                          </SelectTrigger>
                          <SelectContent>
                            {BILLING_STATUS_OPTIONS.map(s => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={customer.payment_status}
                          onValueChange={(v) => handleStatusChange(
                            customer.id, 
                            customer.billing_id, 
                            'payment_status', 
                            v
                          )}
                        >
                          <SelectTrigger className="w-[140px]">
                            {getStatusBadge(customer.payment_status, PAYMENT_STATUS_OPTIONS)}
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_STATUS_OPTIONS.map(s => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ModuleGuard>
  );
}
