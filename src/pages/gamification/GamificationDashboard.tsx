import { GamificationStatsWidget } from '@/components/gamification/GamificationStatsWidget';
import { MissionsWidget } from '@/components/gamification/MissionsWidget';
import { ProspectingReportModal } from '@/components/gamification/ProspectingReportModal';
import { RecentActivitiesTable } from '@/components/gamification/RecentActivitiesTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity } from 'lucide-react';

export default function GamificationDashboard() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row gap-4 items-start justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">Meu Desempenho</h2>
          <p className="text-muted-foreground">Acompanhe seus pontos, missões e progresso.</p>
        </div>
        <ProspectingReportModal />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <GamificationStatsWidget />
        </div>
        <div className="md:col-span-2">
          <MissionsWidget />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Atividades Recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RecentActivitiesTable />
        </CardContent>
      </Card>
    </div>
  );
}
