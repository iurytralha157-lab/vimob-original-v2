import { BarChart3, Users, Building2, MessageSquare, Bell, Activity, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface RecordsCountCardProps {
  counts: {
    whatsapp_messages: number;
    notifications: number;
    activities: number;
    audit_logs: number;
    leads: number;
    users: number;
    organizations: number;
  };
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toLocaleString('pt-BR');
}

const metrics = [
  { key: 'whatsapp_messages', label: 'Mensagens', icon: MessageSquare, color: 'text-green-500' },
  { key: 'leads', label: 'Leads', icon: Users, color: 'text-blue-500' },
  { key: 'notifications', label: 'Notificações', icon: Bell, color: 'text-yellow-500' },
  { key: 'activities', label: 'Atividades', icon: Activity, color: 'text-purple-500' },
  { key: 'users', label: 'Usuários', icon: Users, color: 'text-orange-500' },
  { key: 'organizations', label: 'Organizações', icon: Building2, color: 'text-indigo-500' },
  { key: 'audit_logs', label: 'Audit Logs', icon: FileText, color: 'text-gray-500' },
] as const;

export function RecordsCountCard({ counts }: RecordsCountCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Contagem de Registros</CardTitle>
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            const count = counts[metric.key];
            return (
              <div key={metric.key} className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${metric.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {formatNumber(count)}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {metric.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
