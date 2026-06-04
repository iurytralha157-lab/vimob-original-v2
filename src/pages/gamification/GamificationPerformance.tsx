import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";
import { 
  TrendingUp, 
  Zap, 
  Target, 
  Users, 
  Clock, 
  CheckCircle2,
  ArrowUpRight,
  Loader2
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { startOfWeek, endOfWeek, eachDayOfInterval, format, isSameDay, subMonths, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function GamificationPerformance() {
  const { organization } = useAuth();

  const { data: performanceData, isLoading } = useQuery({
    queryKey: ['gamification-performance', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;

      const now = new Date();
      const startOfThisWeek = startOfWeek(now, { weekStartsOn: 1 });
      const endOfThisWeek = endOfWeek(now, { weekStartsOn: 1 });
      const startOfLastMonth = startOfMonth(subMonths(now, 1));
      const startOfCurrentMonth = startOfMonth(now);

      // Fetch all events since last month to compare
      const { data: events, error } = await supabase
        .from('gamification_activity_logs')
        .select('*')
        .eq('organization_id', organization.id)
        .gte('created_at', startOfLastMonth.toISOString());

      if (error) throw error;

      // Weekly chart data
      const days = eachDayOfInterval({ start: startOfThisWeek, end: endOfThisWeek });
      const chartData = days.map(day => {
        const dayEvents = events.filter(e => isSameDay(new Date(e.created_at), day));
        return {
          name: format(day, 'eee', { locale: ptBR }),
          pontos: dayEvents.reduce((acc, curr) => acc + (curr.points_earned || 0), 0),
          // Count real actions: use metadata.count if available (from reports), otherwise count rows
          acoes: dayEvents.reduce((acc, curr) => {
            const metadata = (curr.metadata as any) || {};
            return acc + (metadata.count || 1);
          }, 0)
        };
      });

      // Metrics
      const thisMonthEvents = events.filter(e => new Date(e.created_at) >= startOfCurrentMonth);
      const lastMonthEvents = events.filter(e => {
        const date = new Date(e.created_at);
        return date >= startOfLastMonth && date < startOfCurrentMonth;
      });

      const thisMonthPoints = thisMonthEvents.reduce((acc, curr) => acc + (curr.points_earned || 0), 0);
      const lastMonthPoints = lastMonthEvents.reduce((acc, curr) => acc + (curr.points_earned || 0), 0);
      
      const growth = lastMonthPoints === 0 ? 100 : Math.round(((thisMonthPoints - lastMonthPoints) / lastMonthPoints) * 100);

      const daysInMonthSoFar = now.getDate();
      const avgActionsPerDay = Math.round((thisMonthEvents.reduce((acc, e) => {
        const metadata = (e.metadata as any) || {};
        return acc + (metadata.count || 1);
      }, 0) / daysInMonthSoFar) * 10) / 10;

      // Real Efficiency calculation: (Positive outcomes / total actions)
      const positiveTypes = ['sale_closed', 'contract_signed', 'proposal_sent', 'visit_scheduled', 'visit_confirmed', 'meeting_held'];
      const positiveEvents = thisMonthEvents.filter(e => positiveTypes.includes(e.action_type)).length;
      const efficiency = thisMonthEvents.length > 0 ? Math.round((positiveEvents / thisMonthEvents.length) * 100) : 0;

      // Real Consistency calculation: (Days with at least one action / days passed in month)
      const activeDays = new Set(thisMonthEvents.map(e => format(new Date(e.created_at), 'yyyy-MM-dd'))).size;
      const consistency = Math.round((activeDays / daysInMonthSoFar) * 100);

      return {
        chartData,
        metrics: {
          points: thisMonthPoints,
          growth,
          avgActionsPerDay,
          totalActions: thisMonthEvents.reduce((acc, e) => {
            const metadata = (e.metadata as any) || {};
            return acc + (metadata.count || 1);
          }, 0),
          efficiency,
          consistency
        },
        distribution: [
          { label: 'Ligações', value: thisMonthEvents.filter(e => e.action_type === 'call_made').reduce((acc, e) => acc + (((e.metadata as any)?.count) || 1), 0) },
          { label: 'Propostas/Vendas', value: thisMonthEvents.filter(e => ['sale_closed', 'contract_signed', 'proposal_sent'].includes(e.action_type)).reduce((acc, e) => acc + (((e.metadata as any)?.count) || 1), 0) },
          { label: 'Reuniões/Visitas', value: thisMonthEvents.filter(e => ['visit_scheduled', 'visit_confirmed', 'meeting_held'].includes(e.action_type)).reduce((acc, e) => acc + (((e.metadata as any)?.count) || 1), 0) },
          { label: 'Lead/Outros', value: thisMonthEvents.filter(e => ['mission_bonus', 'lead_created_manual', 'property_created'].includes(e.action_type)).length },
        ]
      };
    },
    enabled: !!organization?.id
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const metrics = performanceData?.metrics;
  const chartData = performanceData?.chartData;

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Inteligência de Performance</h2>
        <p className="text-muted-foreground">Análise detalhada de produtividade e métricas comerciais.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Eficiência</p>
                <h3 className="text-2xl font-bold">{metrics?.efficiency > 0 ? `${metrics?.efficiency}%` : '—'}</h3>
                <p className="text-[10px] text-emerald-600 flex items-center gap-1 mt-1">
                  {metrics?.efficiency > 0 && <><ArrowUpRight className="h-3 w-3" /> Baseado em conversão</>}
                </p>
              </div>
              <div className="bg-emerald-500 p-2 rounded-lg">
                <Target className="h-5 w-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">Ações/Dia</p>
                <h3 className="text-2xl font-bold">{metrics?.avgActionsPerDay}</h3>
                <p className="text-[10px] text-blue-600 flex items-center gap-1 mt-1">
                  <ArrowUpRight className="h-3 w-3" /> {metrics?.growth > 0 ? '+' : ''}{metrics?.growth}% vs mês ant.
                </p>
              </div>
              <div className="bg-blue-500 p-2 rounded-lg">
                <Zap className="h-5 w-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-500/20 bg-orange-500/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-orange-600 dark:text-orange-400 uppercase tracking-wider">Total Pontos</p>
                <h3 className="text-2xl font-bold">{metrics?.points.toLocaleString()}</h3>
                <p className="text-[10px] text-orange-600 flex items-center gap-1 mt-1">
                  <ArrowUpRight className="h-3 w-3" /> {metrics?.growth > 0 ? '+' : ''}{metrics?.growth}% vs mês ant.
                </p>
              </div>
              <div className="bg-orange-500 p-2 rounded-lg">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-indigo-500/20 bg-indigo-500/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Consistência</p>
                <h3 className="text-2xl font-bold">{metrics?.consistency > 0 ? `${metrics?.consistency}%` : '—'}</h3>
                <p className="text-[10px] text-indigo-600 flex items-center gap-1 mt-1">
                  {metrics?.consistency > 0 && <><Clock className="h-3 w-3" /> Frequência de atividade</>}
                </p>
              </div>
              <div className="bg-indigo-500 p-2 rounded-lg">
                <Clock className="h-5 w-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Evolução de Pontos (Semana)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorPoints" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: 'hsl(var(--muted-foreground))'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: 'hsl(var(--muted-foreground))'}} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}
                  />
                  <Area type="monotone" dataKey="pontos" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorPoints)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Volume de Ações Operacionais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: 'hsl(var(--muted-foreground))'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: 'hsl(var(--muted-foreground))'}} />
                  <Tooltip 
                    cursor={{fill: 'hsl(var(--muted) / 0.4)'}}
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}
                  />
                  <Bar dataKey="acoes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Distribuição por Atividade (Mês Atual)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {performanceData?.distribution.map((item) => {
              const total = performanceData.metrics.totalActions || 1;
              const percentage = Math.round((item.value / total) * 100);
              const color = item.label === 'Ligações' ? 'bg-indigo-500' : item.label === 'Propostas/Vendas' ? 'bg-emerald-500' : item.label === 'Reuniões/Visitas' ? 'bg-orange-500' : 'bg-purple-500';

              return (
                <div key={item.label} className="space-y-2">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                    <span>{item.label}</span>
                    <span>{percentage}%</span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${color}`} style={{ width: `${percentage}%` }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground">{item.value} ações registradas</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
