import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

interface Props {
  data?: { active: number; trial: number; overdue: number; cancelled: number };
  loading?: boolean;
}

export function HealthDonutChart({ data, loading }: Props) {
  const segments = data ? [
    { name: 'Ativos', value: data.active, color: 'hsl(150 70% 45%)' },
    { name: 'Trial', value: data.trial, color: 'hsl(187 85% 40%)' },
    { name: 'Inadimplentes', value: data.overdue, color: 'hsl(38 90% 55%)' },
    { name: 'Cancelados', value: data.cancelled, color: 'hsl(0 70% 55%)' },
  ] : [];
  const total = segments.reduce((s, x) => s + x.value, 0);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Saúde financeira</CardTitle>
        <p className="text-xs text-muted-foreground">Status atual das organizações</p>
      </CardHeader>
      <CardContent>
        {loading || !data ? <Skeleton className="h-[260px] w-full rounded-xl" /> : (
          <div className="relative">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Pie data={segments} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2}>
                  {segments.map((s, i) => <Cell key={i} fill={s.color} stroke="hsl(var(--card))" strokeWidth={2} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center -mt-6">
              <span className="text-2xl font-semibold">{total}</span>
              <span className="text-xs text-muted-foreground">organizações</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
