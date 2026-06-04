import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface Props {
  stats: {
    activeOrganizations: number;
    trialOrganizations: number;
    suspendedOrganizations: number;
  };
}

const COLORS = {
  active: 'hsl(21, 77%, 51%)', // orange
  trial: 'hsl(38, 92%, 50%)',  // amber
  suspended: 'hsl(0, 72%, 51%)', // red
};

export function AdminStatusChart({ stats }: Props) {
  const data = useMemo(() => [
    { name: 'Ativas', value: stats.activeOrganizations, color: COLORS.active },
    { name: 'Em Trial', value: stats.trialOrganizations, color: COLORS.trial },
    { name: 'Suspensas', value: stats.suspendedOrganizations, color: COLORS.suspended },
  ].filter(item => item.value > 0), [stats]);

  const total = stats.activeOrganizations + stats.trialOrganizations + stats.suspendedOrganizations;

  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Distribuição por Status</CardTitle>
          <CardDescription>Organizações por status de assinatura</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[300px]">
          <p className="text-muted-foreground">Sem dados disponíveis</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribuição por Status</CardTitle>
        <CardDescription>Organizações por status de assinatura</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
                formatter={(value: number) => [`${value} organizações`, '']}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
