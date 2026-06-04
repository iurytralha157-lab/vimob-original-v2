import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Trophy, Flag, RotateCcw, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function SeasonsManager() {
  const { organization } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');

  const { data: seasons, isLoading } = useQuery({
    queryKey: ['gamification-seasons', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await (supabase as any)
        .from('gamification_seasons')
        .select('*')
        .eq('organization_id', organization.id)
        .order('started_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id,
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error('Sem organização');
      if (!name.trim()) throw new Error('Informe o nome da nova temporada');
      const { data, error } = await (supabase as any).rpc('reset_gamification_season', {
        p_organization_id: organization.id,
        p_season_name: name.trim(),
        p_reason: reason.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Nova temporada iniciada! Todos os usuários foram notificados.');
      setName('');
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['gamification-seasons'] });
      queryClient.invalidateQueries({ queryKey: ['gamification-user-stats'] });
      queryClient.invalidateQueries({ queryKey: ['gamification-leaderboard-full'] });
      queryClient.invalidateQueries({ queryKey: ['gamification-missions'] });
      queryClient.invalidateQueries({ queryKey: ['gamification-recent-activities'] });
      queryClient.invalidateQueries({ queryKey: ['gamification-history-logs'] });
      queryClient.invalidateQueries({ queryKey: ['gamification-performance'] });
    },
    onError: (err: any) => {
      toast.error('Erro ao iniciar temporada: ' + (err.message || 'desconhecido'));
    },
  });

  const active = (seasons as any[])?.find((s) => s.is_active);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-primary" />
            <CardTitle>Temporada Atual</CardTitle>
          </div>
          <CardDescription>
            O histórico de pontos é preservado. Apenas os níveis, XP e ranking são reiniciados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {active ? (
            <div className="flex items-center justify-between gap-4 p-4 rounded-lg border bg-primary/5">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Em andamento
                </p>
                <h3 className="text-xl font-bold">{active.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Iniciada em{' '}
                  {format(new Date(active.started_at || active.created_at), "dd 'de' MMM 'de' yyyy", {
                    locale: ptBR,
                  })}
                </p>
              </div>
              <Trophy className="h-10 w-10 text-primary opacity-60" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma temporada ativa ainda.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-orange-500" />
            <CardTitle>Iniciar Nova Temporada</CardTitle>
          </div>
          <CardDescription>
            Encerra a atual, zera os níveis de todos os corretores e envia uma notificação para a equipe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Nome da Temporada</label>
            <Input
              placeholder="Ex: Temporada de Outono 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Mensagem para a equipe (opcional)</label>
            <Textarea
              placeholder="Ex: Nova fase, novas metas. Quem chegar primeiro ao Ouro ganha o prêmio do mês."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={!name.trim() || resetMutation.isPending}
                className="w-full sm:w-auto gap-2"
              >
                {resetMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Flag className="h-4 w-4" />
                )}
                Iniciar nova temporada e zerar níveis
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar reinício de temporada</AlertDialogTitle>
                <AlertDialogDescription>
                  Todos os corretores voltarão para o Nível 1 / Bronze I. O histórico de pontos
                  e ações fica preservado para auditoria, mas o ranking começa do zero. Cada
                  membro ativo receberá uma notificação.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => resetMutation.mutate()}>
                  Confirmar e iniciar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de Temporadas</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !seasons || seasons.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma temporada registrada ainda.
            </p>
          ) : (
            <div className="space-y-2">
              {(seasons as any[]).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 p-3 border rounded-lg"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h4 className="font-semibold text-sm truncate">{s.name}</h4>
                      {s.is_active && (
                        <Badge className="text-[9px] bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20">
                          Ativa
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {s.started_at &&
                        format(new Date(s.started_at), "dd/MM/yyyy", { locale: ptBR })}
                      {s.ended_at && (
                        <>
                          {' '}
                          → {format(new Date(s.ended_at), 'dd/MM/yyyy', { locale: ptBR })}
                        </>
                      )}
                      {s.reset_reason && <span className="italic"> • {s.reset_reason}</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
