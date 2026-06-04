import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import {
  Target,
  Plus,
  Trash2,
  Loader2,
  Flame,
  Users,
  Trophy,
  Clock,
} from 'lucide-react';

const ACTION_LABELS: Record<string, string> = {
  call_made: 'Ligações',
  message_sent: 'Mensagens',
  sale_closed: 'Vendas',
  lead_created_manual: 'Novos Leads',
  visit_scheduled: 'Visitas Agendadas',
  visit_confirmed: 'Visitas Confirmadas',
  meeting_scheduled: 'Reuniões Agendadas',
  meeting_held: 'Reuniões Realizadas',
  proposal_sent: 'Propostas',
  contract_signed: 'Contratos',
};

const PERIOD_LABELS: Record<string, string> = {
  daily: 'Diário',
  weekly: 'Semanal',
  monthly: 'Mensal',
};

const EMPTY_MISSION = {
  title: '',
  description: '',
  action_type: 'call_made',
  target_count: 10,
  bonus_points: 100,
  period: 'daily',
  target_scope: 'organization',
  target_user_id: null as string | null,
};

export function MissionManager() {
  const { organization } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [newMission, setNewMission] = useState(EMPTY_MISSION);

  const { data: users } = useQuery({
    queryKey: ['gamification-mission-users', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('users' as any)
        .select('id, name')
        .eq('organization_id', organization.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Array<{ id: string; name: string }>;
    },
    enabled: !!organization?.id,
  });

  const { data: missions, isLoading } = useQuery({
    queryKey: ['gamification-missions-admin', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('gamification_missions' as any)
        .select('*')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as any[];
    },
    enabled: !!organization?.id,
  });

  const createMissionMutation = useMutation({
    mutationFn: async (mission: typeof newMission) => {
      const { error } = await supabase
        .from('gamification_missions' as any)
        .insert([{
          ...mission,
          organization_id: organization?.id,
          target_user_id: mission.target_scope === 'user' ? mission.target_user_id : null,
          is_active: true,
        }]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gamification-missions-admin'] });
      setIsOpen(false);
      setNewMission(EMPTY_MISSION);
      toast.success('Missão criada com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao criar missão: ' + error.message);
    },
  });

  const updateMissionMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('gamification_missions' as any)
        .update({ is_active })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gamification-missions-admin'] });
    },
  });

  const deleteMissionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('gamification_missions' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gamification-missions-admin'] });
      toast.success('Missão removida.');
    },
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-500" />
              <CardTitle>Missões Automáticas</CardTitle>
            </div>
            <CardDescription>
              Crie desafios recorrentes para motivar sua equipe.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setIsOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4 mr-1" /> Nova Missão
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !missions || missions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Target className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">Nenhuma missão criada ainda</p>
              <p className="text-xs text-muted-foreground mt-1">Clique em "Nova Missão" para começar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {missions.map((mission) => (
                <div
                  key={mission.id}
                  className="border rounded-lg p-4 bg-card hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="bg-orange-500/10 p-2 rounded-lg shrink-0">
                        <Target className="h-4 w-4 text-orange-500" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-sm truncate">{mission.title}</h4>
                        {mission.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                            {mission.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant={mission.is_active ? 'default' : 'secondary'} className="text-[10px]">
                        {mission.is_active ? 'Ativa' : 'Inativa'}
                      </Badge>
                      <Switch
                        checked={mission.is_active}
                        onCheckedChange={(checked) =>
                          updateMissionMutation.mutate({ id: mission.id, is_active: checked })
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => deleteMissionMutation.mutate(mission.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Flame className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Tipo:</span>
                      <span className="font-medium truncate">
                        {ACTION_LABELS[mission.action_type] || mission.action_type}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Meta:</span>
                      <span className="font-medium">{mission.target_count}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Trophy className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Recompensa:</span>
                      <span className="font-semibold text-emerald-600">+{mission.bonus_points}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Período:</span>
                      <span className="font-medium">{PERIOD_LABELS[mission.period] || mission.period}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    <span>
                      Público: {mission.target_scope === 'user'
                        ? (users?.find((user) => user.id === mission.target_user_id)?.name || 'Pessoa específica')
                        : 'Toda a equipe'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent className="w-full sm:max-w-[650px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Nova Missão</SheetTitle>
            <SheetDescription>
              Configure um desafio recorrente para sua equipe.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-6">
            <div className="space-y-2">
              <Label>Título da Missão</Label>
              <Input
                placeholder="Ex: Guerreiro de Vendas"
                value={newMission.title}
                onChange={(e) => setNewMission({ ...newMission, title: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                placeholder="Ex: Realize 10 ligações hoje para ganhar o bônus."
                value={newMission.description}
                onChange={(e) => setNewMission({ ...newMission, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Público</Label>
                <Select
                  value={newMission.target_scope}
                  onValueChange={(val) => setNewMission({
                    ...newMission,
                    target_scope: val,
                    target_user_id: val === 'organization' ? null : newMission.target_user_id,
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="organization">Toda a equipe</SelectItem>
                    <SelectItem value="user">Pessoa específica</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newMission.target_scope === 'user' && (
                <div className="space-y-2">
                  <Label>Participante</Label>
                  <Select
                    value={newMission.target_user_id || ''}
                    onValueChange={(val) => setNewMission({ ...newMission, target_user_id: val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma pessoa" />
                    </SelectTrigger>
                    <SelectContent>
                      {(users || []).map((user) => (
                        <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Ação Gatilho</Label>
                <Select
                  value={newMission.action_type}
                  onValueChange={(val) => setNewMission({ ...newMission, action_type: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACTION_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Período de Reset</Label>
                <Select
                  value={newMission.period}
                  onValueChange={(val) => setNewMission({ ...newMission, period: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PERIOD_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Meta (Quantidade)</Label>
                <Input
                  type="number"
                  value={newMission.target_count}
                  onChange={(e) =>
                    setNewMission({ ...newMission, target_count: parseInt(e.target.value) || 0 })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Bônus de Pontos</Label>
                <Input
                  type="number"
                  value={newMission.bonus_points}
                  onChange={(e) =>
                    setNewMission({ ...newMission, bonus_points: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMissionMutation.mutate(newMission)}
              disabled={createMissionMutation.isPending || !newMission.title || (newMission.target_scope === 'user' && !newMission.target_user_id)}
            >
              {createMissionMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Salvar Missão'
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}


