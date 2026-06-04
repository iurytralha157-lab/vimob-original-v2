import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Trophy, Medal, Award, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface LeaderboardUser {
  id: string;
  user_id: string;
  total_points: number;
  profiles: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

const positionIcons = [
  { icon: Trophy, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  { icon: Medal, color: 'text-gray-400', bg: 'bg-gray-400/10' },
  { icon: Award, color: 'text-amber-600', bg: 'bg-amber-600/10' },
];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function LeaderboardWidget() {
  const { organization } = useAuth();

  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ['gamification-leaderboard', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      
      const { data, error } = await supabase
        .from('user_gamification_stats' as any)
        .select(`
          id,
          user_id,
          total_points,
          profiles:user_id (
            full_name,
            avatar_url
          )
        `)
        .eq('organization_id', organization.id)
        .order('total_points', { ascending: false })
        .limit(10);
      
      if (error) throw error;

      if (!data || data.length === 0) {
        const { data: users, error: userError } = await supabase
          .from('users' as any)
          .select('id, name, avatar_url')
          .eq('organization_id', organization.id);
        
        if (userError) throw userError;
        
        return (users || []).map((u: any) => ({
          id: u.id,
          user_id: u.id,
          total_points: 0,
          profiles: {
            full_name: u.name,
            avatar_url: u.avatar_url
          }
        })) as unknown as LeaderboardUser[];
      }

      return data as unknown as LeaderboardUser[];
    },
    enabled: !!organization?.id,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            Ranking de Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-2 w-24" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            Ranking de Performance
          </div>
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Geral</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 flex-1 overflow-auto">
        {leaderboard?.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum dado disponível ainda.</p>
        ) : (
          leaderboard?.map((entry, index) => {
            const position = positionIcons[index];
            const Icon = position?.icon;
            const name = entry.profiles?.full_name || 'Usuário';
            
            return (
              <div
                key={entry.id}
                className={cn(
                  "flex items-center gap-3 py-2 px-2 rounded-md transition-colors",
                  index < 3 ? "bg-muted/30" : ""
                )}
              >
                <div className={cn(
                  "flex items-center justify-center w-6 h-6 rounded text-xs font-bold shrink-0",
                  position?.bg || "bg-muted",
                  position?.color || "text-muted-foreground"
                )}>
                  {Icon ? <Icon className="h-4 w-4" /> : index + 1}
                </div>

                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={entry.profiles?.avatar_url || undefined} />
                  <AvatarFallback className="text-xs">
                    {getInitials(name)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{name}</p>
                  <p className="text-[10px] text-muted-foreground">Corretor de Elite</p>
                </div>

                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1 justify-end text-indigo-600 dark:text-indigo-400">
                    <TrendingUp className="h-3 w-3" />
                    <span className="text-sm font-bold">{entry.total_points.toLocaleString()}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">Pontos</span>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
