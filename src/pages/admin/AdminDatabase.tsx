import { RefreshCw, Trash2, Users, AlertTriangle } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { DatabaseUsageCard } from '@/components/admin/DatabaseUsageCard';
import { StorageUsageCard } from '@/components/admin/StorageUsageCard';
import { TablesBreakdown } from '@/components/admin/TablesBreakdown';
import { DatabaseAlerts } from '@/components/admin/DatabaseAlerts';
import { RecordsCountCard } from '@/components/admin/RecordsCountCard';
import { useDatabaseStats } from '@/hooks/use-database-stats';
import { useOrphanStats, useCleanupOrphans } from '@/hooks/use-cleanup-orphans';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function AdminDatabase() {
  const { data: stats, isLoading, error, refetch, isFetching } = useDatabaseStats();
  const { data: orphanStats, isLoading: orphanLoading } = useOrphanStats();
  const cleanupMutation = useCleanupOrphans();

  if (error) {
    return (
      <AdminLayout title="Banco de Dados">
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-destructive">Erro ao carregar estatísticas: {error.message}</p>
          <Button onClick={() => refetch()}>Tentar novamente</Button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Banco de Dados">
      <div className="space-y-6">
        {/* Header with refresh */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Monitoramento do Banco de Dados</h2>
            <p className="text-sm text-muted-foreground">
              Acompanhe o uso de recursos e receba alertas de limites
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>

        {isLoading ? (
          <LoadingSkeleton />
        ) : stats ? (
          <>
            {/* Main metrics grid */}
            <div className="grid gap-4 md:grid-cols-3">
              <DatabaseUsageCard
                currentBytes={stats.database_size_bytes}
                currentPretty={stats.database_size_pretty}
                limitGB={8}
              />
              <StorageUsageCard
                currentBytes={stats.storage.size_bytes}
                fileCount={stats.storage.count}
                limitGB={100}
              />
              <RecordsCountCard counts={stats.counts} />
            </div>

            {/* Alerts section */}
            <DatabaseAlerts stats={stats} dbLimitGB={8} storageLimitGB={100} />

            {/* Tables breakdown */}
            <TablesBreakdown 
              tables={stats.tables} 
              totalDatabaseBytes={stats.database_size_bytes} 
            />

            {/* Maintenance section - Orphan Cleanup */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Manutenção de Membros
                </CardTitle>
                <CardDescription>
                  Remover membros órfãos de equipes e filas de distribuição (usuários deletados ou sem organização)
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 md:px-6 pb-4 space-y-4">
                {orphanLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : orphanStats && orphanStats.total > 0 ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                      <AlertTriangle className="h-8 w-8 text-destructive" />
                      <div className="flex-1">
                        <p className="font-medium text-destructive">
                          {orphanStats.total} membro(s) órfão(s) encontrado(s)
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {orphanStats.teamOrphans.length} em equipes, {orphanStats.rrOrphans.length} em filas de distribuição
                        </p>
                      </div>
                      <Button 
                        variant="destructive" 
                        onClick={() => cleanupMutation.mutate()}
                        disabled={cleanupMutation.isPending}
                      >
                        {cleanupMutation.isPending ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Limpando...
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Executar Limpeza
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Details of orphans */}
                    <div className="grid gap-3 md:grid-cols-2">
                      {orphanStats.teamOrphans.length > 0 && (
                        <div className="p-3 border rounded-lg">
                          <h4 className="font-medium mb-2 text-sm">Órfãos em Equipes</h4>
                          <ul className="space-y-1">
                            {orphanStats.teamOrphans.map((orphan) => (
                              <li key={orphan.member_id} className="text-xs flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px]">
                                  {orphan.reason === 'user_deleted' ? 'Deletado' : 
                                   orphan.reason === 'user_no_org' ? 'Sem org' : 'Org diferente'}
                                </Badge>
                                <span className="truncate">{orphan.team_name}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {orphanStats.rrOrphans.length > 0 && (
                        <div className="p-3 border rounded-lg">
                          <h4 className="font-medium mb-2 text-sm">Órfãos em Filas</h4>
                          <ul className="space-y-1">
                            {orphanStats.rrOrphans.map((orphan) => (
                              <li key={orphan.member_id} className="text-xs flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px]">
                                  {orphan.reason === 'user_deleted' ? 'Deletado' : 
                                   orphan.reason === 'user_no_org' ? 'Sem org' : 'Org diferente'}
                                </Badge>
                                <span className="truncate">{orphan.queue_name}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 p-4 bg-primary/10 rounded-lg border border-primary/20">
                    <Users className="h-8 w-8 text-primary" />
                    <div>
                      <p className="font-medium text-primary">Tudo limpo!</p>
                      <p className="text-sm text-muted-foreground">
                        Nenhum membro órfão encontrado
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-4 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
