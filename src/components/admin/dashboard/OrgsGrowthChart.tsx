import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  data?: Array<{ date: string; created: number; active: number; disabled: number }>;
  loading?: boolean;
  bucket?: 'dia' | 'mês';
}

export function OrgsGrowthChart({ data = [], loading, bucket = 'dia' }: Props) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Fluxo de organizações</CardTitle>
        <p className="text-xs text-muted-foreground">
          Entradas, ativas e desativadas no período filtrado
        </p>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-[420px] w-full rounded-xl" /> : (
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => format(parseISO(d), bucket === 'mês' ? 'MMM/yy' : 'dd/MM', { locale: ptBR })}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={30} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12 }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="created" name="Entraram" fill="hsl(var(--primary))" radius={[6,6,0,0]} />
              <Bar dataKey="active" name="Ativas" fill="hsl(145 65% 42%)" radius={[6,6,0,0]} />
              <Bar dataKey="disabled" name="Desativadas" fill="hsl(0 70% 55%)" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
