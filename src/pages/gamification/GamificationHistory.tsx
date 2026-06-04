import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { ACTION_LABELS, SOURCE_LABELS } from '@/lib/gamification-labels';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function GamificationHistory() {
  const { user, profile, isSuperAdmin } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin' || isSuperAdmin;
  const targetUserId = selectedUserId || user?.id;

  const { data: history, isLoading } = useQuery({
    queryKey: ['gamification-history-logs', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return [];
      // Reading from logs for consistency and better details
      const { data, error } = await supabase
        .from('gamification_activity_logs')
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as any[];
    },
    enabled: !!targetUserId,
  });

  const { data: users } = useQuery({
    queryKey: ['org-users-gamification-list'],
    queryFn: async () => {
      const { data } = await supabase.from('users' as any).select('id, name');
      return data || [];
    },
    enabled: isAdmin
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">Transparência e Histórico</h2>
          <p className="text-muted-foreground">Veja todas as ações que geraram pontos no sistema.</p>
        </div>
        
        {isAdmin && users && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium whitespace-nowrap">Filtrar Usuário:</span>
            <Select 
              value={selectedUserId || 'me'} 
              onValueChange={(val) => setSelectedUserId(val === 'me' ? null : val)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Selecione um usuário" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="me">Meu Histórico</SelectItem>
                {users.map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Registro de Atividades
          </CardTitle>
          <CardDescription>
            Detalhamento de pontos ganhos por ação realizada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead className="text-center">Pontos</TableHead>
                  <TableHead>Detalhes</TableHead>
                  <TableHead>Origem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!history || history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Nenhuma atividade registrada ainda.
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((item) => {
                    const actionType = item.action_type || item.event_type;
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {format(new Date(item.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-semibold">
                            {ACTION_LABELS[actionType] || actionType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center font-bold text-emerald-600">
                          +{item.points_earned}
                        </TableCell>
                         <TableCell className="text-sm">
                          {item.metadata?.count ? (
                            <span className="text-muted-foreground">
                              {item.metadata.count}
                              {item.metadata.unit_points && ` × ${item.metadata.unit_points} pts`}
                              {item.metadata.source && ` • Origem: ${item.metadata.source}`}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px] uppercase">
                            {SOURCE_LABELS[item.source_module] || item.source_module || 'Sistema'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
