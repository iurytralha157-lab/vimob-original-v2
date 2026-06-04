import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Trophy, 
  Medal, 
  Award, 
  TrendingUp, 
  Crown, 
  PartyPopper, 
  Phone,
  MessageSquare,
  BadgeDollarSign,
  Target,
  Calendar,
  ChevronDown,
  Filter,
  FileText,
  Users2,
  Presentation,
  Volume2,
  VolumeX
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useEffect, useState, useMemo, useRef } from 'react';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { startOfDay, endOfDay } from 'date-fns';
import { DateFilterPopover } from '@/components/ui/date-filter-popover';
import { DatePreset, getDateRangeFromPreset } from '@/hooks/use-dashboard-filters';

interface LeaderboardUser {
  id: string;
  user_id: string;
  total_points: number;
  profiles: {
    name: string | null;
    avatar_url: string | null;
  } | null;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatRankingValue(value: number, type: string): string {
  if (type !== 'vgv') return value.toLocaleString();
  
  if (value >= 1_000_000_000) {
    return `R$ ${(value / 1_000_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} Bi`;
  }
  if (value >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} Mi`;
  }
  if (value >= 1_000) {
    return `R$ ${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  }
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export default function GamificationRanking() {
  const { organization } = useAuth();
  const isMobile = !!window.matchMedia('(max-width: 767px)').matches;
  const [prevTopUserId, setPrevTopUserId] = useState<string | null>(null);
  const [rankingType, setRankingType] = useState('general');
  const [datePreset, setDatePreset] = useState<DatePreset>('thisMonth');
  const [customDateRange, setCustomDateRange] = useState<{ from: Date; to: Date } | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasInteracted = useRef(false);

  // Load sound effect
  useEffect(() => {
    const audio = new Audio('https://fbiovhgrkuxvnyfvxqov.supabase.co/storage/v1/object/public/system-assets/senna-victory.mp3');
    audio.volume = 0.5;
    audioRef.current = audio;

    const handleInteraction = () => {
      hasInteracted.current = true;
      window.removeEventListener('click', handleInteraction);
    };
    window.addEventListener('click', handleInteraction);

    return () => {
      window.removeEventListener('click', handleInteraction);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const playVictorySound = () => {
    if (audioRef.current && !isMuted && hasInteracted.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.log('Audio play failed:', e));
    }
  };

  const dateRange = useMemo(() => {
    if (datePreset === 'custom' && customDateRange) {
      return customDateRange;
    }
    return getDateRangeFromPreset(datePreset);
  }, [datePreset, customDateRange]);

  const { data: leaderboard, isLoading, refetch } = useQuery({
    queryKey: ['gamification-leaderboard-full', organization?.id, rankingType, datePreset, customDateRange],
    queryFn: async () => {
      if (!organization?.id) return [];

      const { data: nonParticipants } = await supabase
        .from('gamification_participants' as any)
        .select('user_id')
        .eq('organization_id', organization.id)
        .eq('participates', false);
      const excludedUserIds = new Set((nonParticipants || []).map((p: any) => p.user_id));
      
      // Query events instead of stats for filtered/period points
      let query = supabase
        .from('gamification_activity_logs')
        .select('user_id, points_earned, action_type')
        .eq('organization_id', organization.id)
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());

      if (rankingType !== 'general') {
        if (rankingType === 'vgv') {
          // Real VGV from leads table
          const { data: vgvLeads, error: vgvError } = await supabase
            .from('leads')
            .select('assigned_user_id, valor_interesse')
            .eq('organization_id', organization.id)
            .eq('deal_status', 'won')
            .gte('won_at', dateRange.from.toISOString())
            .lte('won_at', dateRange.to.toISOString());
          
          if (vgvError) throw vgvError;
          
          const vgvByUser: Record<string, number> = {};
          vgvLeads?.forEach((l: any) => {
            if (l.assigned_user_id) {
              vgvByUser[l.assigned_user_id] = (vgvByUser[l.assigned_user_id] || 0) + Number(l.valor_interesse || 0);
            }
          });
          
          const { data: users } = await supabase.from('users' as any).select('id, name, avatar_url').eq('organization_id', organization.id);
          return (users || []).filter((u: any) => !excludedUserIds.has(u.id)).map((u: any) => ({
            id: u.id,
            user_id: u.id,
            total_points: vgvByUser[u.id] || 0,
            profiles: { name: u.name, avatar_url: u.avatar_url }
          })).sort((a, b) => b.total_points - a.total_points) as LeaderboardUser[];
        }

        const typeMap: Record<string, string[]> = {
          calls: ['call_made'],
          messages: ['message_sent'],
          proposals: ['proposal_sent'],
          sales: ['sale_closed', 'contract_signed'],
          meetings: ['meeting_held'],
          visits: ['visit_scheduled', 'visit_confirmed'],
          general: ['call_made', 'message_sent', 'proposal_sent', 'sale_closed', 'contract_signed', 'meeting_held', 'visit_scheduled', 'visit_confirmed', 'mission_bonus', 'lead_created', 'lead_created_manual', 'property_created']
        };
        const types = typeMap[rankingType] || [];
        if (types.length > 0) {
          query = query.in('action_type', types);
        }
      }

      const { data: events, error: eventsError } = await query;
      
      if (eventsError) throw eventsError;

      // Aggregate points by user
      const pointsByUser: Record<string, number> = {};
      events?.forEach((event: any) => {
        pointsByUser[event.user_id] = (pointsByUser[event.user_id] || 0) + (event.points_earned || 0);
      });

      // Fetch user profiles
      const { data: userData, error: userError } = await supabase
        .from('users' as any)
        .select('id, name, avatar_url')
        .eq('organization_id', organization.id);

      if (userError) throw userError;

      const mergedData = (userData || []).filter((user: any) => !excludedUserIds.has(user.id)).map((user: any) => ({
        id: user.id,
        user_id: user.id,
        total_points: pointsByUser[user.id] || 0,
        profiles: {
          name: user.name,
          avatar_url: user.avatar_url
        }
      }));

      return mergedData.sort((a, b) => b.total_points - a.total_points) as LeaderboardUser[];
    },
    enabled: !!organization?.id,
  });

  // Realtime subscription
  useEffect(() => {
    if (!organization?.id) return;

    const channel = supabase
      .channel('ranking_events')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'gamification_activity_logs',
          filter: `organization_id=eq.${organization.id}`
        },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organization?.id, refetch]);

  // Effect for celebrations when 1st place changes
  useEffect(() => {
    if (leaderboard && leaderboard.length > 0 && leaderboard[0].total_points > 0) {
      const currentTopUser = leaderboard[0];
      if (prevTopUserId && prevTopUserId !== currentTopUser.user_id) {
        // Celebration!
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#FFD700', '#FFA500', '#FF4500']
        });
        
        playVictorySound();

        toast.success(`${currentTopUser.profiles?.name} assumiu a LIDERANÇA! 🏆`, {
          icon: <PartyPopper className="text-yellow-500" />,
          duration: 8000,
        });
      }
      setPrevTopUserId(currentTopUser.user_id);
    }
  }, [leaderboard, prevTopUserId]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-[calc(100vh-200px)]">
        <Skeleton className="md:col-span-8 h-full rounded-xl" />
        <Skeleton className="md:col-span-4 h-full rounded-xl" />
      </div>
    );
  }

  const topThree = leaderboard?.slice(0, 3) || [];

  return (
    <div className="flex flex-col gap-4 lg:gap-6 animate-in fade-in duration-700 pb-10">
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 h-auto lg:h-[calc(100vh-210px)] min-h-[500px] lg:min-h-0 overflow-visible lg:overflow-hidden">
        
        {/* LEFT SIDE: PODIUM (Arena) */}
        <div className="lg:col-span-8 flex flex-col gap-6 h-full overflow-hidden">
          <div className="relative flex-1 bg-gradient-to-b from-indigo-900/10 via-background to-background border rounded-2xl p-4 lg:p-10 flex flex-col items-center justify-end overflow-hidden shadow-none min-h-[400px] lg:min-h-0">
            <div className="absolute top-4 lg:top-8 left-4 lg:left-8 flex items-center gap-2">
              <div className="bg-yellow-500/20 p-1.5 lg:p-2 rounded-full">
                <Trophy className="h-5 w-5 lg:h-6 lg:w-6 text-yellow-500" />
              </div>
              <h2 className="text-lg lg:text-2xl font-black italic uppercase tracking-tighter text-indigo-900 dark:text-indigo-100">
                Arena Imobiliária {
                  rankingType === 'general' ? 'de Elite' : 
                  rankingType === 'calls' ? 'de Ligações' :
                  rankingType === 'messages' ? 'de Mensagens' :
                  rankingType === 'proposals' ? 'de Propostas' :
                  rankingType === 'sales' ? 'de Vendas' :
                  rankingType === 'meetings' ? 'de Reuniões' :
                  rankingType === 'visits' ? 'de Visitas' :
                  rankingType === 'vgv' ? 'de VGV Financeiro' :
                  'de Elite'
                }
              </h2>
            </div>

            <div className="absolute top-4 lg:top-8 right-4 lg:right-8 flex items-center gap-4">
              {!isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full bg-background/20 backdrop-blur-md hover:bg-background/40"
                  onClick={() => setIsMuted(!isMuted)}
                >
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
              )}
              <div className="text-right">
                <div className="flex items-center gap-1 text-emerald-500 text-[10px] lg:text-base font-bold animate-pulse">
                  <div className="w-1.5 h-1.5 lg:w-2 lg:h-2 rounded-full bg-emerald-500" />
                  LIVE
                </div>
              </div>
            </div>

            {/* Podium Visualization */}
            <div className="flex items-end justify-center gap-2 lg:gap-8 w-full max-w-4xl relative z-10 mb-2 mt-auto">
              {/* 2nd Place */}
              {topThree[1] && (
                <div className="flex flex-col items-center gap-2 lg:gap-6 flex-1 max-w-[100px] sm:max-w-[120px] lg:max-w-[180px]">
                  <div className="relative group">
                    <Avatar className="h-16 w-16 sm:h-20 sm:w-20 lg:h-32 lg:w-32 border-2 lg:border-4 border-slate-300 transition-all duration-300">
                      <AvatarImage src={topThree[1].profiles?.avatar_url || undefined} />
                      <AvatarFallback className="text-base sm:text-lg lg:text-2xl">{getInitials(topThree[1].profiles?.name || '')}</AvatarFallback>
                    </Avatar>
                    <div className="absolute -top-1 -right-1 sm:-top-2 sm:-right-2 bg-slate-100 text-slate-600 rounded-full p-1 sm:p-2 border border-slate-300 shadow-lg">
                      <Medal className="h-4 w-4 sm:h-5 sm:w-5 lg:h-7 lg:w-7" />
                    </div>
                  </div>
                  <div className="bg-slate-300/30 w-full rounded-t-xl sm:rounded-t-2xl p-2 sm:p-3 lg:p-6 text-center min-h-[80px] sm:min-h-[100px] lg:min-h-[160px] flex flex-col justify-center border-x border-t border-slate-300/50 backdrop-blur-sm">
                    <p className="font-bold text-[10px] sm:text-xs lg:text-base truncate w-full px-1 mb-0.5 sm:mb-1 text-slate-700 dark:text-slate-200">{topThree[1].profiles?.name}</p>
                    <p className={cn(
                      "font-black text-slate-800 dark:text-slate-100 leading-none tracking-tighter",
                      rankingType === 'vgv' ? "text-[10px] sm:text-base lg:text-2xl" : "text-lg sm:text-xl lg:text-3xl"
                    )}>
                      {formatRankingValue(topThree[1].total_points, rankingType)}
                    </p>
                    <p className="text-[8px] sm:text-[9px] lg:text-[11px] uppercase font-bold text-slate-500 tracking-widest mt-1 sm:mt-2 lg:mt-3">{rankingType === 'vgv' ? 'VGV' : 'Pontos'}</p>
                  </div>
                </div>
              )}

              {/* 1st Place */}
              {topThree[0] && (
                <div className="flex flex-col items-center gap-2 lg:gap-6 flex-1 max-w-[120px] sm:max-w-[140px] lg:max-w-[220px]">
                  <div className="relative group">
                    <div className="absolute -top-6 sm:-top-10 lg:-top-16 left-1/2 -translate-x-1/2 animate-bounce">
                      <Crown className="h-6 w-6 sm:h-10 sm:w-10 lg:h-16 lg:w-16 text-yellow-500 fill-yellow-500 drop-shadow-[0_0_20px_rgba(234,179,8,0.6)]" />
                    </div>
                    <Avatar className="h-20 w-20 sm:h-24 sm:w-24 lg:h-44 lg:w-44 border-3 sm:border-4 lg:border-8 border-yellow-500 transition-all duration-300">
                      <AvatarImage src={topThree[0].profiles?.avatar_url || undefined} />
                      <AvatarFallback className="text-xl sm:text-2xl lg:text-4xl font-bold">{getInitials(topThree[0].profiles?.name || '')}</AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-2 sm:-bottom-3 left-1/2 -translate-x-1/2 bg-yellow-500 text-yellow-950 text-[8px] sm:text-[10px] lg:text-xs font-black px-2 sm:px-3 lg:px-5 py-0.5 sm:py-1 lg:py-1.5 rounded-full shadow-xl whitespace-nowrap border-2 border-yellow-200 z-20">
                      TOP 1
                    </div>
                  </div>
                  <div className="bg-gradient-to-b from-yellow-500/30 via-yellow-500/10 to-transparent w-full rounded-t-2xl sm:rounded-t-3xl p-3 sm:p-4 lg:p-8 text-center min-h-[110px] sm:min-h-[140px] lg:min-h-[240px] flex flex-col justify-center border-x border-t border-yellow-500/60 shadow-[0_-15px_50px_rgba(234,179,8,0.15)] backdrop-blur-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-0.5 sm:h-1 bg-gradient-to-r from-transparent via-yellow-300 to-transparent opacity-50" />
                    <p className="font-black text-xs sm:text-sm lg:text-xl truncate w-full mb-1 lg:mb-2 px-1 text-indigo-950 dark:text-white">{topThree[0].profiles?.name}</p>
                    <p className={cn(
                      "font-black text-yellow-600 drop-shadow-md leading-none tracking-tighter",
                      rankingType === 'vgv' ? "text-sm sm:text-2xl lg:text-4xl" : "text-2xl sm:text-3xl lg:text-5xl"
                    )}>
                      {formatRankingValue(topThree[0].total_points, rankingType)}
                    </p>
                    <p className="text-[8px] sm:text-[10px] lg:text-sm uppercase font-black text-yellow-700 tracking-[0.2em] mt-2 sm:mt-3 lg:mt-4">{rankingType === 'vgv' ? 'VGV Total' : 'Campeão'}</p>
                  </div>
                </div>
              )}

              {/* 3rd Place */}
              {topThree[2] && (
                <div className="flex flex-col items-center gap-2 lg:gap-6 flex-1 max-w-[90px] sm:max-w-[110px] lg:max-w-[160px]">
                  <div className="relative group">
                    <Avatar className="h-14 w-14 sm:h-18 sm:w-18 lg:h-28 lg:w-28 border-2 lg:border-4 border-amber-600 transition-all duration-300">
                      <AvatarImage src={topThree[2].profiles?.avatar_url || undefined} />
                      <AvatarFallback className="text-sm sm:text-base lg:text-xl">{getInitials(topThree[2].profiles?.name || '')}</AvatarFallback>
                    </Avatar>
                    <div className="absolute -top-1 -right-1 sm:-top-1.5 sm:-right-1.5 bg-amber-50 text-amber-700 rounded-full p-1 sm:p-1.5 border border-amber-600 shadow-lg">
                      <Award className="h-3 w-3 sm:h-4 sm:w-4 lg:h-6 lg:w-6" />
                    </div>
                  </div>
                  <div className="bg-amber-600/20 w-full rounded-t-lg sm:rounded-t-xl p-2 sm:p-3 lg:p-5 text-center min-h-[60px] sm:min-h-[80px] lg:min-h-[130px] flex flex-col justify-center border-x border-t border-amber-600/40 backdrop-blur-sm">
                    <p className="font-bold text-[9px] sm:text-[10px] lg:text-sm truncate w-full px-1 mb-0.5 sm:mb-1 text-amber-900 dark:text-amber-200">{topThree[2].profiles?.name}</p>
                    <p className={cn(
                      "font-black text-amber-800 dark:text-amber-300 leading-none tracking-tighter",
                      rankingType === 'vgv' ? "text-[9px] sm:text-sm lg:text-xl" : "text-base sm:text-lg lg:text-2xl"
                    )}>
                      {formatRankingValue(topThree[2].total_points, rankingType)}
                    </p>
                    <p className="text-[8px] sm:text-[9px] lg:text-[10px] uppercase font-bold text-amber-600 tracking-widest mt-1 sm:mt-2 lg:mt-3">{rankingType === 'vgv' ? 'VGV' : 'Pontos'}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Floor */}
            <div className="w-full h-2 bg-indigo-900/10 rounded-full mt-[-2px] blur-sm" />
          </div>
        </div>

        {/* RIGHT SIDE: LIST (The Field) */}
        <div className="lg:col-span-4 flex flex-col overflow-hidden border rounded-2xl bg-card shadow-none h-auto lg:h-full min-h-[400px]">
          <div className="p-4 border-b bg-muted/30 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base lg:text-lg font-bold flex items-center gap-2">
                Classificação 
              </h3>
              
              <div className="flex items-center gap-1">
                <DateFilterPopover
                  datePreset={datePreset}
                  onDatePresetChange={(p) => p && setDatePreset(p)}
                  customDateRange={customDateRange}
                  onCustomDateRangeChange={setCustomDateRange}
                  align="end"
                />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-2">
                      <Filter className="h-4 w-4 text-indigo-600" />
                      <span className="hidden sm:inline">
                        {rankingType === 'general' ? 'Geral' : 
                         rankingType === 'calls' ? 'Ligações' :
                         rankingType === 'messages' ? 'Mensagens' :
                         rankingType === 'proposals' ? 'Propostas' :
                         rankingType === 'sales' ? 'Vendas' :
                         rankingType === 'meetings' ? 'Reuniões' :
                          rankingType === 'visits' ? 'Visitas' : 
                          rankingType === 'vgv' ? 'VGV Financeiro' : 'Filtrar'}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setRankingType('general')} className={cn(rankingType === 'general' && "bg-muted")}>
                      <Target className="mr-2 h-4 w-4" /> Geral
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRankingType('calls')} className={cn(rankingType === 'calls' && "bg-muted")}>
                      <Phone className="mr-2 h-4 w-4" /> Ligações
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRankingType('messages')} className={cn(rankingType === 'messages' && "bg-muted")}>
                      <MessageSquare className="mr-2 h-4 w-4" /> Mensagens
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRankingType('proposals')} className={cn(rankingType === 'proposals' && "bg-muted")}>
                      <FileText className="mr-2 h-4 w-4" /> Propostas
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRankingType('sales')} className={cn(rankingType === 'sales' && "bg-muted")}>
                      <BadgeDollarSign className="mr-2 h-4 w-4" /> Vendas
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRankingType('meetings')} className={cn(rankingType === 'meetings' && "bg-muted")}>
                      <Presentation className="mr-2 h-4 w-4" /> Reuniões
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRankingType('visits')} className={cn(rankingType === 'visits' && "bg-muted")}>
                      <Users2 className="mr-2 h-4 w-4" /> Visitas
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRankingType('vgv')} className={cn(rankingType === 'vgv' && "bg-muted")}>
                      <BadgeDollarSign className="mr-2 h-4 w-4 text-emerald-500" /> Ranking de VGV
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 lg:p-4 space-y-2 lg:space-y-3 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
            {leaderboard?.map((user, index) => {
              const isTop3 = index < 3;
              return (
                <div 
                  key={user.id} 
                  className={cn(
                    "group flex items-center gap-2 lg:gap-4 p-2.5 lg:p-3 rounded-2xl transition-all duration-300 border",
                    isTop3 
                      ? "bg-indigo-50/30 dark:bg-indigo-950/20 border-indigo-100/50 dark:border-indigo-900/30" 
                      : "bg-card border-transparent hover:border-border hover:bg-muted/30"
                  )}
                >
                  <div className={cn(
                    "w-7 h-7 lg:w-8 lg:h-8 flex items-center justify-center rounded-full text-[10px] lg:text-xs font-black shrink-0 shadow-sm",
                    index === 0 ? "bg-gradient-to-br from-yellow-400 to-yellow-600 text-yellow-950" : 
                    index === 1 ? "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800" :
                    index === 2 ? "bg-gradient-to-br from-amber-500 to-amber-700 text-white" : "bg-muted text-muted-foreground"
                  )}>
                    {index + 1}
                  </div>
                  
                  <div className="relative shrink-0">
                    <Avatar className="h-10 w-10 lg:h-12 lg:w-12 border-2 border-background shadow-md transition-transform lg:group-hover:scale-110">
                      <AvatarImage src={user.profiles?.avatar_url || undefined} />
                      <AvatarFallback className="text-[10px] lg:text-xs font-bold bg-muted">{getInitials(user.profiles?.name || '')}</AvatarFallback>
                    </Avatar>
                    {isTop3 && (
                      <div className="absolute -top-1 -right-1">
                        {index === 0 && <Crown className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
                        {index === 1 && <Medal className="h-4 w-4 text-slate-400 fill-slate-400" />}
                        {index === 2 && <Award className="h-4 w-4 text-amber-600 fill-amber-600" />}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm lg:text-base font-bold truncate leading-tight text-foreground">{user.profiles?.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <p className="text-[10px] lg:text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Corretor de Elite</p>
                    </div>
                  </div>

                  <div className="text-right shrink-0 px-1 lg:px-2">
                    <p className={cn(
                      "font-black tracking-tight",
                      rankingType === 'vgv' ? "text-indigo-600 dark:text-indigo-400 text-xs lg:text-sm" : "text-indigo-600 dark:text-indigo-400 text-base lg:text-lg"
                    )}>
                      {rankingType === 'vgv' ? formatRankingValue(user.total_points, rankingType) : user.total_points.toLocaleString()}
                    </p>
                    <p className="text-[8px] lg:text-[10px] uppercase font-bold text-muted-foreground/60 tracking-widest leading-none mt-0.5">{rankingType === 'vgv' ? 'VGV Total' : 'Pontos'}</p>
                  </div>
                </div>
              );
            })}

            {(!leaderboard || leaderboard.length === 0 || leaderboard.every(u => u.total_points === 0)) && (
              <div className="flex flex-col items-center justify-center py-20 text-center opacity-50">
                <Trophy className="h-12 w-12 mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">A arena está vazia...</p>
                <p className="text-xs">Nenhuma ação registrada neste período.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
