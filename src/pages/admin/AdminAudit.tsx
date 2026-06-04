import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Shield, Search, Filter, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuditLogs, AuditLog, AuditLogFilters } from '@/hooks/use-audit-logs';
import { useSuperAdmin } from '@/hooks/use-super-admin';

const actionLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  create: { label: 'Criar', variant: 'default' },
  update: { label: 'Atualizar', variant: 'secondary' },
  delete: { label: 'Excluir', variant: 'destructive' },
  login: { label: 'Login', variant: 'outline' },
  logout: { label: 'Logout', variant: 'outline' },
  impersonate_start: { label: 'Iniciar Impersonação', variant: 'secondary' },
  impersonate_stop: { label: 'Parar Impersonação', variant: 'secondary' },
};

const entityLabels: Record<string, string> = {
  lead: 'Lead',
  user: 'Usuário',
  organization: 'Organização',
  contract: 'Contrato',
  commission: 'Comissão',
  team: 'Equipe',
  property: 'Imóvel',
  pipeline: 'Pipeline',
  session: 'Sessão',
};

export default function AdminAudit() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  
  const { organizations } = useSuperAdmin();
  const { data: logsData, isLoading } = useAuditLogs(filters, page, 20);

  const handleFilterChange = (key: keyof AuditLogFilters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value === 'all' ? undefined : value,
    }));
    setPage(1);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Logs de Auditoria
          </h1>
          <p className="text-muted-foreground mt-1">
            Acompanhe todas as ações realizadas no sistema
          </p>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Filter className="h-5 w-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 md:px-6 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Select
                value={filters.organizationId || 'all'}
                onValueChange={(v) => handleFilterChange('organizationId', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Organização" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas organizações</SelectItem>
                  {organizations?.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.action || 'all'}
                onValueChange={(v) => handleFilterChange('action', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas ações</SelectItem>
                  {Object.entries(actionLabels).map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.entityType || 'all'}
                onValueChange={(v) => handleFilterChange('entityType', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Entidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas entidades</SelectItem>
                  {Object.entries(entityLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="date"
                placeholder="Data inicial"
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Tabela de Logs */}
        <Card>
          <CardHeader>
            <CardTitle>Registros</CardTitle>
            <CardDescription>
              {logsData?.count || 0} registros encontrados
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 md:px-6 pb-4">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Organização</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>Entidade</TableHead>
                      <TableHead className="text-right">Detalhes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logsData?.data.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-sm">
                          {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          {log.user?.name || log.user?.email || 'Sistema'}
                        </TableCell>
                        <TableCell>
                          {log.organization?.name || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={actionLabels[log.action]?.variant || 'outline'}>
                            {actionLabels[log.action]?.label || log.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {entityLabels[log.entity_type] || log.entity_type}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedLog(log)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {logsData?.data.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Nenhum registro encontrado
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>

                {/* Paginação */}
                {logsData && logsData.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Página {page} de {logsData.totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(logsData.totalPages, p + 1))}
                        disabled={page === logsData.totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog de Detalhes */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="w-[90%] sm:max-w-2xl sm:w-full rounded-lg">
          <DialogHeader>
            <DialogTitle>Detalhes do Log</DialogTitle>
            <DialogDescription>
              Informações completas da ação registrada
            </DialogDescription>
          </DialogHeader>
          
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Data/Hora</p>
                  <p>{format(new Date(selectedLog.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Usuário</p>
                  <p>{selectedLog.user?.name || selectedLog.user?.email || 'Sistema'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Ação</p>
                  <Badge variant={actionLabels[selectedLog.action]?.variant || 'outline'}>
                    {actionLabels[selectedLog.action]?.label || selectedLog.action}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Entidade</p>
                  <p>{entityLabels[selectedLog.entity_type] || selectedLog.entity_type}</p>
                </div>
                {selectedLog.entity_id && (
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-muted-foreground">ID da Entidade</p>
                    <p className="font-mono text-sm">{selectedLog.entity_id}</p>
                  </div>
                )}
              </div>

              {(selectedLog.old_data || selectedLog.new_data) && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Dados Alterados</p>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedLog.old_data && (
                      <div>
                        <p className="text-xs font-medium mb-1 text-red-600">Antes</p>
                        <ScrollArea className="h-48 rounded border bg-muted/50 p-2">
                          <pre className="text-xs">
                            {JSON.stringify(selectedLog.old_data, null, 2)}
                          </pre>
                        </ScrollArea>
                      </div>
                    )}
                    {selectedLog.new_data && (
                      <div>
                        <p className="text-xs font-medium mb-1 text-orange-600">Depois</p>
                        <ScrollArea className="h-48 rounded border bg-muted/50 p-2">
                          <pre className="text-xs">
                            {JSON.stringify(selectedLog.new_data, null, 2)}
                          </pre>
                        </ScrollArea>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedLog.user_agent && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">User Agent</p>
                  <p className="text-xs text-muted-foreground break-all">{selectedLog.user_agent}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
