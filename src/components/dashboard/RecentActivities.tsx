import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  ArrowRight, 
  MessageSquare, 
  UserPlus, 
  PhoneCall, 
  FileText, 
  Activity,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActivityItem {
  id: string;
  type: string;
  content: string | null;
  created_at: string;
  lead_name?: string;
  user_name?: string;
}

const activityConfig: Record<string, { icon: any; color: string; label: string }> = {
  stage_change: { icon: ArrowRight, color: 'text-primary', label: 'Moveu lead' },
  message_sent: { icon: MessageSquare, color: 'text-emerald-500', label: 'Enviou mensagem' },
  message_received: { icon: MessageSquare, color: 'text-blue-500', label: 'Recebeu mensagem' },
  lead_created: { icon: UserPlus, color: 'text-chart-2', label: 'Novo lead' },
  lead_assigned: { icon: UserPlus, color: 'text-chart-3', label: 'Lead atribuído' },
  call: { icon: PhoneCall, color: 'text-chart-4', label: 'Ligação' },
  note: { icon: FileText, color: 'text-chart-5', label: 'Nota adicionada' },
  deal_status_change: { icon: Activity, color: 'text-primary', label: 'Status alterado' },
};

const defaultConfig = { icon: Activity, color: 'text-muted-foreground', label: 'Atividade' };

export function RecentActivities() {
  const { organization } = useAuth();

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['dashboard-recent-activities', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const { data, error } = await supabase
        .from('activities')
        .select(`
          id,
          type,
          content,
          created_at,
          lead_id,
          user_id,
          leads:lead_id(name),
          users:user_id(name)
        `)
        .eq('leads.organization_id', organization.id)
        .order('created_at', { ascending: false })
        .limit(8);

      if (error) {
        // Fallback: query without join filter
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('activities')
          .select(`
            id,
            type,
            content,
            created_at,
            lead_id,
            user_id
          `)
          .order('created_at', { ascending: false })
          .limit(50);

        if (fallbackError) throw fallbackError;

        // Filter by org leads
        const { data: orgLeadIds } = await supabase
          .from('leads')
          .select('id')
          .eq('organization_id', organization.id);

        const leadIdSet = new Set((orgLeadIds || []).map(l => l.id));
        const filtered = (fallbackData || [])
          .filter(a => leadIdSet.has(a.lead_id))
          .slice(0, 8);

        // Fetch names
        const leadIds = [...new Set(filtered.map(a => a.lead_id).filter(Boolean))];
        const userIds = [...new Set(filtered.map(a => a.user_id).filter(Boolean))];

        const [leadsRes, usersRes] = await Promise.all([
          leadIds.length > 0 ? supabase.from('leads').select('id, name').in('id', leadIds) : { data: [] },
          userIds.length > 0 ? supabase.from('users').select('id, name').in('id', userIds as string[]) : { data: [] },
        ]);

        const leadMap = new Map((leadsRes.data || []).map(l => [l.id, l.name]));
        const userMap = new Map((usersRes.data || []).map(u => [u.id, u.name]));

        return filtered.map(a => ({
          id: a.id,
          type: a.type,
          content: a.content,
          created_at: a.created_at,
          lead_name: leadMap.get(a.lead_id) || 'Lead',
          user_name: userMap.get(a.user_id) || undefined,
        }));
      }

      return (data || []).map((a: any) => ({
        id: a.id,
        type: a.type,
        content: a.content,
        created_at: a.created_at,
        lead_name: a.leads?.name || 'Lead',
        user_name: a.users?.name || undefined,
      }));
    },
    enabled: !!organization?.id,
    refetchInterval: 30000, // Refresh every 30s
  });

  if (isLoading) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium">Atividades Recentes</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 px-4 pb-3 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-2">
              <Skeleton className="h-6 w-6 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  function getDescription(activity: ActivityItem) {
    const config = activityConfig[activity.type] || defaultConfig;
    const userName = activity.user_name || 'Sistema';
    const leadName = activity.lead_name || 'Lead';

    // If we have content, use a cleaned version
    if (activity.content) {
      // Truncate long content
      const clean = activity.content.length > 80 
        ? activity.content.substring(0, 77) + '...' 
        : activity.content;
      return clean;
    }

    switch (activity.type) {
      case 'stage_change':
        return `${userName} moveu "${leadName}" de etapa`;
      case 'message_sent':
        return `${userName} enviou mensagem para "${leadName}"`;
      case 'message_received':
        return `"${leadName}" enviou mensagem`;
      case 'lead_created':
        return `Lead "${leadName}" foi criado`;
      case 'lead_assigned':
        return `"${leadName}" foi atribuído a ${userName}`;
      case 'deal_status_change':
        return `Status de "${leadName}" foi alterado`;
      case 'note':
        return `${userName} adicionou nota em "${leadName}"`;
      default:
        return `${config.label} - "${leadName}"`;
    }
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Atividades Recentes</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex-1 px-4 pb-3 overflow-y-auto">
        {activities.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhuma atividade recente
          </p>
        ) : (
          <div className="space-y-2">
            {activities.map((activity) => {
              const config = activityConfig[activity.type] || defaultConfig;
              const Icon = config.icon;

              return (
                <div key={activity.id} className="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-0">
                  <div className={cn(
                    "h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                    "bg-muted/50"
                  )}>
                    <Icon className={cn("h-3 w-3", config.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-relaxed text-foreground line-clamp-2">
                      {getDescription(activity)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(activity.created_at), { 
                        addSuffix: true, 
                        locale: ptBR 
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
