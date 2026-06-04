import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { startOfMonth, endOfMonth } from "date-fns";

export interface TeamRankingEntry {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  closedCount: number; // only sales count, NEVER R$ value
  position: number;
  isCurrentUser: boolean;
}

export interface TeamRankingData {
  ranking: TeamRankingEntry[];
  myPosition: number | null;
}

export function useTeamRanking(dateRange?: { from: Date; to: Date }) {
  const { user, profile } = useAuth();
  const userId = user?.id;
  const organizationId = profile?.organization_id;

  return useQuery({
    queryKey: ["team-ranking", organizationId, userId, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async (): Promise<TeamRankingData> => {
      if (!organizationId || !userId) {
        return { ranking: [], myPosition: null };
      }

      const now = new Date();
      const monthStart = dateRange ? dateRange.from.toISOString() : startOfMonth(now).toISOString();
      const monthEnd = dateRange ? dateRange.to.toISOString() : endOfMonth(now).toISOString();

      // Fetch active users in org
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id, name, avatar_url")
        .eq("organization_id", organizationId)
        .eq("is_active", true);

      if (usersError) throw usersError;
      if (!users || users.length === 0) return { ranking: [], myPosition: null };

      // Fetch won leads in current month — only count, no R$ values
      const { data: wonLeads, error: leadsError } = await supabase
        .from("leads")
        .select("id, assigned_user_id, name")
        .eq("organization_id", organizationId)
        .eq("deal_status", "won")
        .gte("won_at", monthStart)
        .lte("won_at", monthEnd)
        .not("assigned_user_id", "is", null);

      if (leadsError) throw leadsError;

      // Count per user
      const countMap = new Map<string, number>();
      const lastWonByUser = new Map<string, any>();

      (wonLeads || []).forEach((l) => {
        if (l.assigned_user_id) {
          const currentCount = countMap.get(l.assigned_user_id) || 0;
          countMap.set(l.assigned_user_id, currentCount + 1);
          lastWonByUser.set(l.assigned_user_id, l);
        }
      });

      // Build ranking sorted by closedCount desc
      const ranking: TeamRankingEntry[] = users
        .map((u) => ({
          userId: u.id,
          userName: u.name,
          avatarUrl: u.avatar_url,
          closedCount: countMap.get(u.id) || 0,
          position: 0,
          isCurrentUser: u.id === userId,
        }))
        .sort((a, b) => b.closedCount - a.closedCount)
        .map((entry, index) => ({ ...entry, position: index + 1 }));

      const myEntry = ranking.find((r) => r.isCurrentUser);
      const myPosition = myEntry?.position ?? null;

      // DISPARAR NOTIFICAÇÃO DE ATUALIZAÇÃO DE RANKING se houver mudanças significativas
      // (Isso é um "side effect" no queryFn, geralmente evitado, mas útil aqui para trigger sob demanda)
      if (myEntry && myEntry.closedCount > 0) {
        try {
          const { notificationService } = await import('@/services/NotificationService');
          const lastLead = lastWonByUser.get(userId);
          
          await notificationService.send({
            eventKey: 'ranking_update',
            organizationId: organizationId,
            userId: userId,
            variables: {
              user_name: myEntry.userName,
              position: String(myPosition),
              total_sales: String(myEntry.closedCount),
              last_lead: lastLead?.name || 'Venda'
            },
            dedupeKey: `ranking_update:${userId}:${myEntry.closedCount}` // Só notifica se o contador mudar
          });
        } catch (err) {
          console.error('Failed to trigger ranking notification:', err);
        }
      }

      return { ranking, myPosition };
    },
    enabled: !!organizationId && !!userId,
    staleTime: 1000 * 60 * 5, // 5 minutos de cache
  });
}
