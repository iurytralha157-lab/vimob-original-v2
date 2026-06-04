import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Organization {
  id: string;
  created_at: string;
  subscription_status: string;
}

interface Props {
  organizations: Organization[];
}

export function AdminGrowthChart({ organizations }: Props) {
  const chartData = useMemo(() => {
    const now = new Date();
    const months = [];
    
    // Generate last 6 months
    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const start = startOfMonth(monthDate);
      const end = endOfMonth(monthDate);
      
      const orgsInMonth = organizations.filter(org => {
        const createdAt = new Date(org.created_at);
        return createdAt >= start && createdAt <= end;
      });

      const totalUpToMonth = organizations.filter(org => {
        const createdAt = new Date(org.created_at);
        return createdAt <= end;
      }).length;

      months.push({
        month: format(monthDate, 'MMM', { locale: ptBR }),
        novas: orgsInMonth.length,
        total: totalUpToMonth,
        ativas: organizations.filter(org => {
          const createdAt = new Date(org.created_at);
          return createdAt <= end && org.subscription_status === 'active';
        }).length,
      });
    }
    
    return months;
  }, [organizations]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crescimento de Organizações</CardTitle>
        <CardDescription>Evolução nos últimos 6 meses</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="month" 
                className="text-xs fill-muted-foreground"
              />
              <YAxis className="text-xs fill-muted-foreground" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="novas" 
                name="Novas" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))' }}
              />
              <Line 
                type="monotone" 
                dataKey="total" 
                name="Total Acumulado" 
                stroke="hsl(var(--chart-2))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--chart-2))' }}
              />
              <Line 
                type="monotone" 
                dataKey="ativas" 
                name="Ativas" 
                stroke="hsl(var(--chart-3))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--chart-3))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
