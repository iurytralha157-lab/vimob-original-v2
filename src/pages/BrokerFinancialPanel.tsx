
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { PremiumFinancialCard } from '@/components/financial/PremiumFinancialCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CommissionStatusBadge } from '@/components/financial/CommissionStatusBadge';
import { formatCurrency, formatDate } from '@/lib/export-financial';
import { DollarSign, TrendingUp, Clock, CheckCircle2, Award, Target } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function BrokerFinancialPanel() {
  const { user } = useAuth();

  const { data: commissions, isLoading } = useQuery({
    queryKey: ['broker-commissions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commissions')
        .select(`
          *,
          contract:contracts(contract_number, client_name),
          property:properties(code, title)
        `)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  if (isLoading) {
    return (
      <AppLayout title="Meu Financeiro">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </AppLayout>
    );
  }

  const stats = {
    paid: commissions?.filter(c => c.status === 'paid').reduce((acc, c) => acc + Number(c.calculated_value), 0) || 0,
    approved: commissions?.filter(c => c.status === 'approved').reduce((acc, c) => acc + Number(c.calculated_value), 0) || 0,
    forecast: commissions?.filter(c => c.status === 'forecast').reduce((acc, c) => acc + Number(c.calculated_value), 0) || 0,
    totalDeals: new Set(commissions?.map(c => c.contract_id)).size,
  };

  return (
    <AppLayout title="Meu Financeiro (Corretor)">
      <div className="space-y-6">
        {/* KPI Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <PremiumFinancialCard
            title="Recebido"
            value={formatCurrency(stats.paid)}
            icon={CheckCircle2}
            variant="success"
            chartData={commissions?.filter(c => c.status === 'paid').map(c => ({ value: Number(c.calculated_value) }))}
          />
          <PremiumFinancialCard
            title="Liberado para Receber"
            value={formatCurrency(stats.approved)}
            icon={DollarSign}
            variant="primary"
          />
          <PremiumFinancialCard
            title="Previsão Futura"
            value={formatCurrency(stats.forecast)}
            icon={Clock}
            variant="warning"
          />
          <PremiumFinancialCard
            title="Total Negócios"
            value={String(stats.totalDeals)}
            icon={Award}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Commissions Table */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Histórico de Comissões</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contrato</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Sua Parte</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Previsão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Nenhuma comissão encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    commissions?.map((comm) => (
                      <TableRow key={comm.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-medium">{comm.contract?.contract_number || 'S/N'}</TableCell>
                        <TableCell>{comm.contract?.client_name || '-'}</TableCell>
                        <TableCell className="text-right font-bold text-primary">{formatCurrency(comm.calculated_value)}</TableCell>
                        <TableCell>
                          <CommissionStatusBadge status={comm.status} />
                        </TableCell>
                        <TableCell>{formatDate(comm.forecast_date)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Goal Progress / Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                Sua Meta Mensal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Progresso (VGV)</span>
                  <span className="font-bold">65%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-3">
                  <div className="bg-primary h-3 rounded-full transition-all" style={{ width: '65%' }} />
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">Faltam R$ 350k para atingir sua meta de R$ 1.0M</p>
              </div>

              <div className="pt-4 border-t space-y-3">
                <h4 className="text-sm font-semibold">Dica do Gestor</h4>
                <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    "Foque nos leads da etapa 'Apresentação' esta semana. Temos 3 imóveis com comissão bonificada!"
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
