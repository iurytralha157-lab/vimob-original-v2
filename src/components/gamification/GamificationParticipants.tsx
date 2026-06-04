import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldOff, Trophy, Users } from 'lucide-react';
import { toast } from 'sonner';

export function GamificationParticipants() {
  const { organization } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['gamification-participants-admin', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const [{ data: users, error: usersError }, { data: participants, error: participantsError }] = await Promise.all([
        supabase
          .from('users' as any)
          .select('id, name, email, role, is_active')
          .eq('organization_id', organization.id)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('gamification_participants' as any)
          .select('user_id, participates')
          .eq('organization_id', organization.id),
      ]);

      if (usersError) throw usersError;
      if (participantsError) throw participantsError;

      const participationByUser = new Map((participants || []).map((p: any) => [p.user_id, p.participates]));

      return (users || []).map((user: any) => ({
        ...user,
        participates: participationByUser.has(user.id) ? participationByUser.get(user.id) : true,
      }));
    },
    enabled: !!organization?.id,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ userId, participates }: { userId: string; participates: boolean }) => {
      const { error } = await supabase
        .from('gamification_participants' as any)
        .upsert({
          organization_id: organization?.id,
          user_id: userId,
          participates,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id,user_id' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gamification-participants-admin'] });
      queryClient.invalidateQueries({ queryKey: ['gamification-leaderboard-full'] });
      toast.success('Participação atualizada.');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar participante: ' + error.message);
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <CardTitle>Participantes da Competição</CardTitle>
        </div>
        <CardDescription>
          Controle quem entra no ranking. Usuários desligados da competição não recebem novos pontos nem aparecem na classificação.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : (
          <div className="space-y-3">
            {(data || []).map((user: any) => (
              <div key={user.id} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{user.name}</p>
                    {user.role === 'admin' && <Badge variant="secondary" className="text-[10px]">Admin</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden text-right sm:block">
                    <p className="text-xs font-medium">{user.participates ? 'Competindo' : 'Fora do ranking'}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {user.participates ? 'Pontua normalmente' : 'Pontuação pausada'}
                    </p>
                  </div>
                  {user.participates ? (
                    <Trophy className="h-4 w-4 text-yellow-500" />
                  ) : (
                    <ShieldOff className="h-4 w-4 text-muted-foreground" />
                  )}
                  <Switch
                    checked={user.participates}
                    onCheckedChange={(checked) => toggleMutation.mutate({ userId: user.id, participates: checked })}
                    disabled={toggleMutation.isPending}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
