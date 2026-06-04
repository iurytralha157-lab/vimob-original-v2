import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Star, TrendingUp, Phone, MessageSquare, UserCheck, Trophy, FileText, Presentation, Users2, Calendar } from 'lucide-react';
import { ACTION_LABELS } from '@/lib/gamification-labels';

const ACTION_ICONS: Record<string, any> = {
  call_made: Phone,
  message_sent: MessageSquare,
  contact_made: UserCheck,
  visit_scheduled: TrendingUp,
  sale_closed: Trophy,
  prospecting_report: Star,
  mission_bonus: Star,
  meeting_held: Presentation,
  meeting_scheduled: Calendar,
  proposal_sent: FileText,
  contract_signed: Trophy,
  visit_confirmed: Users2,
  lead_created: Star,
  lead_created_manual: Star,
  property_created: Star,
};

interface GameificationLog {
  id: string;
  user_id: string;
  organization_id: string;
  action_type: string;
  points_earned: number;
  reference_id: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
  idempotency_key?: string;
}

export function RecentActivitiesTable() {
  const { user } = useAuth();

  const { data: activities, isLoading } = useQuery({
    queryKey: ['gamification-recent-activities', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('gamification_activity_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data as GameificationLog[];
    },
    enabled: !!user?.id,
  });

  if (isLoading) return <div className="p-4 text-center text-sm text-muted-foreground">Carregando atividades...</div>;
  if (!activities || activities.length === 0) return <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</div>;

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="max-h-[420px] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
            <TableRow>
              <TableHead>Ação</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Pontos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activities.map((activity) => {
              const actionType = (activity.action_type) as string;
              const Icon = ACTION_ICONS[actionType] || Star;
              const metadata = activity.metadata as any;
              const count = metadata?.count || 0;
              const unitPoints = metadata?.unit_points || 0;
              const sourceModule = metadata?.source_module || 'system';
              
              return (
                <TableRow key={activity.id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary shrink-0" />
                        <span className="truncate max-w-[150px] sm:max-w-none">
                          {ACTION_LABELS[actionType] || actionType}
                        </span>
                      </div>
                      {count > 0 && unitPoints > 0 && (
                        <span className="text-[10px] text-muted-foreground ml-6">
                          {count} × {unitPoints} pts = {activity.points_earned}
                          {sourceModule && sourceModule !== 'system' && ` • ${sourceModule}`}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(activity.created_at), "dd 'de' MMM, HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-right font-bold text-emerald-600">
                    +{activity.points_earned}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
