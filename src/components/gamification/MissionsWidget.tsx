import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Target, CheckCircle2, Flame, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ACTION_LABELS } from '@/lib/gamification-labels';
import { Badge } from '@/components/ui/badge';

export function MissionsWidget() {
  const { user, organization } = useAuth();

  const { data: missions, isLoading } = useQuery({
    queryKey: ['gamification-missions', user?.id],
    queryFn: async () => {
      if (!user?.id || !organization?.id) return [];
      
      const { data: missionsData, error: missionsError } = await supabase
        .from('gamification_missions' as any)
        .select('*')
        .eq('organization_id', organization.id)
        .eq('is_active', true);
      
      if (missionsError) throw missionsError;

      const { data: progressData, error: progressError } = await supabase
        .from('user_mission_progress' as any)
        .select('*')
        .eq('user_id', user.id);

      if (progressError) throw progressError;

      return (missionsData as any[]).map(mission => {
        const progress = (progressData as any[])?.find(p => p.mission_id === mission.id);
        return {
          ...mission,
          current_count: progress?.current_count || 0,
          is_completed: progress?.is_completed || false,
          completed_at: progress?.completed_at || null,
        };
      });
    },
    enabled: !!user?.id && !!organization?.id,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-orange-500" />
            Missões Ativas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!missions || missions.length === 0) return null;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" />
            Missões Diárias & Semanais
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {missions.map((mission) => {
          const progressPercent = Math.min((mission.current_count / mission.target_count) * 100, 100);
          const actionLabel = ACTION_LABELS[mission.action_type] || mission.action_type;
          const remaining = Math.max(mission.target_count - mission.current_count, 0);

          return (
            <div key={mission.id} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h4 className={cn(
                      "text-sm font-semibold flex items-center gap-1 truncate",
                      mission.is_completed && "text-emerald-600 line-through"
                    )}>
                      {mission.is_completed && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                      {mission.title}
                    </h4>
                    <Badge variant="secondary" className="text-[9px] px-1.5 h-4 uppercase font-bold text-primary bg-primary/10 whitespace-nowrap">
                      {actionLabel}
                    </Badge>
                  </div>
                  {mission.is_completed && mission.completed_at && (
                    <p className="text-[10px] text-emerald-600 font-medium">
                      Concluída em {format(new Date(mission.completed_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {mission.description}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full whitespace-nowrap">
                    +{mission.bonus_points} pts
                  </span>
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-medium text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-2 w-2" />
                    {!mission.is_completed && remaining > 0 ? (
                      <span className="text-primary">Faltam {remaining} {actionLabel.toLowerCase()}</span>
                    ) : (
                      <span>{mission.period === 'daily' ? 'Reseta hoje' : 'Reseta domingo'}</span>
                    )}
                  </span>
                  <span>{mission.current_count} / {mission.target_count}</span>
                </div>
                <Progress 
                  value={progressPercent} 
                  className={cn(
                    "h-1.5",
                    mission.is_completed ? "bg-emerald-100" : "bg-primary/15"
                  )}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
