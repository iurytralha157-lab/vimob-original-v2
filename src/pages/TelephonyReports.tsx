import { useState } from "react";
import { format, subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, TrendingUp, Users, Calendar } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  useTelephonyMetrics, 
  useTelephonyRanking, 
  useOrganizationCalls,
  formatCallDuration, 
  formatTotalTime 
} from "@/hooks/use-telephony";
import { useUsers } from "@/hooks/use-users";
import { useTeams } from "@/hooks/use-teams";

type PeriodType = 'today' | 'week' | 'month' | 'custom';

export default function TelephonyReports() {
  const [period, setPeriod] = useState<PeriodType>('week');
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('all');

  const { data: users } = useUsers();
  const { data: teams } = useTeams();

  const getDateRange = () => {
    const now = new Date();
    switch (period) {
      case 'today':
        return { startDate: startOfDay(now), endDate: endOfDay(now) };
      case 'week':
        return { startDate: startOfWeek(now, { locale: ptBR }), endDate: endOfWeek(now, { locale: ptBR }) };
      case 'month':
        return { startDate: startOfMonth(now), endDate: endOfMonth(now) };
      default:
        return { startDate: subDays(now, 30), endDate: now };
    }
  };

  const dateRange = getDateRange();

  const { data: metrics, isLoading: metricsLoading } = useTelephonyMetrics({
    ...dateRange,
    userId: selectedUserId !== 'all' ? selectedUserId : undefined,
    teamId: selectedTeamId !== 'all' ? selectedTeamId : undefined,
  });

  const { data: ranking, isLoading: rankingLoading } = useTelephonyRanking({
    ...dateRange,
    teamId: selectedTeamId !== 'all' ? selectedTeamId : undefined,
    limit: 10,
  });

  const { data: recentCalls, isLoading: callsLoading } = useOrganizationCalls({
    ...dateRange,
    userId: selectedUserId !== 'all' ? selectedUserId : undefined,
    limit: 20,
  });

  return (
    <AppLayout title="Relatórios de Telefonia">
      <div className="space-y-6">
        <p className="text-muted-foreground">Métricas e análises de chamadas</p>
        
        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Período</label>
                <div className="flex gap-2">
                  {(['today', 'week', 'month'] as PeriodType[]).map((p) => (
                    <Button
                      key={p}
                      variant={period === p ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPeriod(p)}
                    >
                      {p === 'today' ? 'Hoje' : p === 'week' ? 'Semana' : 'Mês'}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Corretor</label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Todos os corretores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os corretores</SelectItem>
                    {users?.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Equipe</label>
                <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Todas as equipes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as equipes</SelectItem>
                    {teams?.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Total de Ligações"
            value={metrics?.totalCalls || 0}
            icon={Phone}
            loading={metricsLoading}
          />
          <MetricCard
            title="Ligações Atendidas"
            value={metrics?.answeredCalls || 0}
            subtitle={`${metrics?.answerRate || 0}% taxa de atendimento`}
            icon={PhoneIncoming}
            loading={metricsLoading}
            iconColor="text-green-500"
          />
          <MetricCard
            title="Ligações Perdidas"
            value={metrics?.missedCalls || 0}
            icon={PhoneMissed}
            loading={metricsLoading}
            iconColor="text-destructive"
          />
          <MetricCard
            title="Tempo Total em Linha"
            value={formatTotalTime(metrics?.talkTimeTotal || 0)}
            subtitle={`Média: ${formatCallDuration(metrics?.talkTimeAvg || 0)}`}
            icon={Clock}
            loading={metricsLoading}
            isTime
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Broker Ranking */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Ranking de Corretores
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rankingLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : ranking && ranking.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Corretor</TableHead>
                      <TableHead className="text-right">Ligações</TableHead>
                      <TableHead className="text-right">Atendidas</TableHead>
                      <TableHead className="text-right">Tempo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ranking.map((broker, index) => (
                      <TableRow key={broker.userId}>
                        <TableCell className="font-medium">
                          {index + 1}º
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={broker.avatarUrl || undefined} />
                              <AvatarFallback>
                                {broker.userName?.charAt(0) || '?'}
                              </AvatarFallback>
                            </Avatar>
                            <span>{broker.userName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {broker.totalCalls}
                        </TableCell>
                        <TableCell className="text-right">
                          {broker.answeredCalls}
                          <span className="text-xs text-muted-foreground ml-1">
                            ({broker.answerRate}%)
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatTotalTime(broker.talkTimeTotal)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum dado disponível para o período
                </p>
              )}
            </CardContent>
          </Card>

          {/* Recent Calls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Ligações Recentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {callsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : recentCalls && recentCalls.length > 0 ? (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {recentCalls.map((call) => (
                    <div
                      key={call.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-full ${
                          call.status === 'missed' || call.status === 'no_answer'
                            ? 'bg-destructive/10 text-destructive'
                            : call.direction === 'inbound'
                            ? 'bg-blue-500/10 text-blue-500'
                            : 'bg-green-500/10 text-green-500'
                        }`}>
                          {call.status === 'missed' || call.status === 'no_answer' ? (
                            <PhoneMissed className="h-4 w-4" />
                          ) : call.direction === 'inbound' ? (
                            <PhoneIncoming className="h-4 w-4" />
                          ) : (
                            <PhoneOutgoing className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {(call.lead as any)?.name || call.phone_to || 'Desconhecido'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(call.user as any)?.name || 'N/A'} • {call.initiated_at && format(new Date(call.initiated_at), "dd/MM HH:mm")}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={
                          call.status === 'missed' || call.status === 'no_answer' 
                            ? 'destructive' 
                            : 'secondary'
                        }>
                          {call.status === 'ended' || call.status === 'answered' ? 'Atendida' : 
                           call.status === 'missed' || call.status === 'no_answer' ? 'Perdida' : 
                           call.status}
                        </Badge>
                        {call.duration_seconds && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatCallDuration(call.duration_seconds)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma ligação no período
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
  iconColor?: string;
  isTime?: boolean;
}

function MetricCard({ title, value, subtitle, icon: Icon, loading, iconColor = "text-primary", isTime }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className={`font-bold ${isTime ? 'text-xl' : 'text-2xl'}`}>
              {value}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
