import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { useAllFeatureRequests, useRespondFeatureRequest } from '@/hooks/use-feature-requests';
import { 
  Lightbulb, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Search,
  MessageSquare,
  Building2,
  User,
  Filter,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_CONFIG = {
  pending: { label: 'Pendente', variant: 'secondary' as const, icon: Clock },
  analyzing: { label: 'Em Análise', variant: 'default' as const, icon: Search },
  approved: { label: 'Aprovada', variant: 'default' as const, icon: CheckCircle2, className: "bg-green-500 hover:bg-green-600 text-white border-transparent" },
  rejected: { label: 'Não Aprovada', variant: 'destructive' as const, icon: XCircle },
};

type RequestStatus = keyof typeof STATUS_CONFIG;

export default function AdminRequests() {
  const { data: requests = [], isLoading } = useAllFeatureRequests();
  const respondMutation = useRespondFeatureRequest();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedRequest, setSelectedRequest] = useState<typeof requests[0] | null>(null);
  const [responseStatus, setResponseStatus] = useState<RequestStatus>('approved');
  const [responseText, setResponseText] = useState('');

  const filteredRequests = requests.filter((req) => {
    const matchesSearch = 
      req.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.organization?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.user?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || req.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: requests.length,
    pending: requests.filter((r) => r.status === 'pending').length,
    analyzing: requests.filter((r) => r.status === 'analyzing').length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
  };

  const handleRespond = async () => {
    if (!selectedRequest) return;

    await respondMutation.mutateAsync({
      id: selectedRequest.id,
      status: responseStatus,
      admin_response: responseText.trim() || undefined,
    });

    setSelectedRequest(null);
    setResponseText('');
  };

  const openResponseDialog = (request: typeof requests[0]) => {
    setSelectedRequest(request);
    setResponseStatus(request.status === 'pending' ? 'analyzing' : request.status);
    setResponseText(request.admin_response || '');
  };

  return (
    <AdminLayout title="Solicitações de Melhoria">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </CardContent>
          </Card>
          <Card className="border-yellow-500/50">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
              <p className="text-xs text-muted-foreground">Pendentes</p>
            </CardContent>
          </Card>
          <Card className="border-blue-500/50">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.analyzing}</p>
              <p className="text-xs text-muted-foreground">Em Análise</p>
            </CardContent>
          </Card>
          <Card className="border-green-500/50">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
              <p className="text-xs text-muted-foreground">Aprovadas</p>
            </CardContent>
          </Card>
          <Card className="border-red-500/50">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
              <p className="text-xs text-muted-foreground">Rejeitadas</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por título, descrição, organização ou usuário..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filtrar status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="analyzing">Em Análise</SelectItem>
                  <SelectItem value="approved">Aprovadas</SelectItem>
                  <SelectItem value="rejected">Não Aprovadas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Requests Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              Solicitações ({filteredRequests.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 md:px-6 pb-4">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : filteredRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma solicitação encontrada
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Título</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Organização</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRequests.map((request) => {
                      const config = STATUS_CONFIG[request.status];
                      const StatusIcon = config.icon;

                      return (
                        <TableRow key={request.id}>
                          <TableCell>
                            <div className="max-w-xs">
                              <p className="font-medium truncate">{request.title}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {request.description.slice(0, 60)}...
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{request.category}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <Building2 className="h-3 w-3" />
                              {request.organization?.name || '-'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <User className="h-3 w-3" />
                              {request.user?.name || '-'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={config.variant} className={(config as any).className}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {config.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(request.created_at), "dd/MM/yy", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openResponseDialog(request)}
                            >
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Response Dialog */}
        <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Responder Solicitação</DialogTitle>
            </DialogHeader>

            {selectedRequest && (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{selectedRequest.category}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(selectedRequest.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <h4 className="font-medium">{selectedRequest.title}</h4>
                  <p className="text-sm text-muted-foreground">{selectedRequest.description}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {selectedRequest.organization?.name}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {selectedRequest.user?.name}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Select value={responseStatus} onValueChange={(v) => setResponseStatus(v as RequestStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="analyzing">Em Análise</SelectItem>
                      <SelectItem value="approved">Aprovada</SelectItem>
                      <SelectItem value="rejected">Não Aprovada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Resposta (opcional)</label>
                  <Textarea
                    placeholder="Escreva uma resposta para o usuário..."
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    rows={4}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedRequest(null)}>
                Cancelar
              </Button>
              <Button onClick={handleRespond} disabled={respondMutation.isPending}>
                {respondMutation.isPending ? 'Salvando...' : 'Salvar Resposta'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
