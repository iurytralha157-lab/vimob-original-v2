import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Trophy, Star, Zap } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

interface Stats {
  xp: number;
  current_level: number;
  xp_current_level: number;
  xp_next_level: number;
  rank_tier: string;
}

export function GamificationStatsWidget() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const lastLevelRef = useRef<number | null>(null);
  const lastXpRef = useRef<number | null>(null);

  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ['gamification-user-stats', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('user_gamification_stats' as any)
        .select('xp, current_level, xp_current_level, xp_next_level, rank_tier')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Stats) || { xp: 0, current_level: 1, xp_current_level: 0, xp_next_level: 100, rank_tier: 'Bronze I' };
    },
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (!stats) return;
    if (lastLevelRef.current !== null && stats.current_level > lastLevelRef.current) {
      toast.success(`🏆 Nível ${stats.current_level} desbloqueado!`, {
        description: `Rank atual: ${stats.rank_tier}. Continue assim!`,
        duration: 6000,
      });
    } else if (lastXpRef.current !== null && stats.xp > lastXpRef.current) {
      const gained = stats.xp - lastXpRef.current;
      toast(`+${gained} XP`, { description: 'Boa! Sua ação foi registrada.', duration: 3000 });
    }
    lastLevelRef.current = stats.current_level;
    lastXpRef.current = stats.xp;
  }, [stats?.xp, stats?.current_level, stats?.rank_tier]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`user-stats-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_gamification_stats',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        refetch();
        queryClient.invalidateQueries({ queryKey: ['gamification-missions', user.id] });
        queryClient.invalidateQueries({ queryKey: ['gamification-recent-activities', user.id] });
        queryClient.invalidateQueries({ queryKey: ['gamification-ranking'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, refetch, queryClient]);

  if (isLoading || !stats) {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-2 w-full" />
        </CardContent>
      </Card>
    );
  }

  const xp = stats.xp || 0;
  const levelStart = stats.xp_current_level || 0;
  const levelEnd = stats.xp_next_level || levelStart + 100;
  const span = Math.max(levelEnd - levelStart, 1);
  const inLevel = Math.max(xp - levelStart, 0);
  const remaining = Math.max(levelEnd - xp, 0);
  const progress = Math.min((inLevel / span) * 100, 100);

  return (
    <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-2 rounded-lg">
              <Trophy className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{stats.rank_tier}</p>
              <h3 className="text-xl font-bold">Nível {stats.current_level}</h3>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">XP Total</p>
            <div className="flex items-center gap-1 justify-end">
              <Star className="h-4 w-4 text-primary fill-primary" />
              <span className="text-xl font-bold">{xp.toLocaleString('pt-BR')}</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs font-medium">
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-primary" />
              Progresso do Nível
            </span>
            <span>{inLevel.toLocaleString('pt-BR')} / {span.toLocaleString('pt-BR')} XP</span>
          </div>
          <Progress value={progress} className="h-2 bg-primary/20" />
          <p className="text-[10px] text-muted-foreground text-center italic">
            Faltam {remaining.toLocaleString('pt-BR')} XP para o próximo nível!
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
