import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DatabaseStats, TableStats } from '@/hooks/use-database-stats';
import { cn } from '@/lib/utils';

interface DatabaseAlertsProps {
  stats: DatabaseStats;
  dbLimitGB?: number;
  storageLimitGB?: number;
}

interface AlertItem {
  type: 'critical' | 'warning' | 'info' | 'success';
  title: string;
  description: string;
}

function getAlerts(stats: DatabaseStats, dbLimitGB: number, storageLimitGB: number): AlertItem[] {
  const alerts: AlertItem[] = [];
  
  const dbLimitBytes = dbLimitGB * 1024 * 1024 * 1024;
  const storageLimitBytes = storageLimitGB * 1024 * 1024 * 1024;
  
  const dbPercentage = (stats.database_size_bytes / dbLimitBytes) * 100;
  const storagePercentage = (stats.storage.size_bytes / storageLimitBytes) * 100;
  
  // Database alerts
  if (dbPercentage >= 95) {
    alerts.push({
      type: 'critical',
      title: 'Banco de dados crítico!',
      description: `O banco está em ${dbPercentage.toFixed(1)}% da capacidade. Ação imediata necessária para evitar problemas de performance.`,
    });
  } else if (dbPercentage >= 85) {
    alerts.push({
      type: 'warning',
      title: 'Banco de dados em alerta',
      description: `O banco está em ${dbPercentage.toFixed(1)}% da capacidade. Considere limpar dados antigos ou fazer upgrade do plano.`,
    });
  } else if (dbPercentage >= 70) {
    alerts.push({
      type: 'info',
      title: 'Banco de dados em atenção',
      description: `O banco está em ${dbPercentage.toFixed(1)}% da capacidade. Monitore o crescimento.`,
    });
  }
  
  // Storage alerts
  if (storagePercentage >= 95) {
    alerts.push({
      type: 'critical',
      title: 'Storage crítico!',
      description: `O storage está em ${storagePercentage.toFixed(1)}% da capacidade. Remova arquivos não utilizados.`,
    });
  } else if (storagePercentage >= 85) {
    alerts.push({
      type: 'warning',
      title: 'Storage em alerta',
      description: `O storage está em ${storagePercentage.toFixed(1)}% da capacidade.`,
    });
  }
  
  // Table-specific alerts
  const largeMessageTables = stats.tables.filter(
    t => t.name === 'whatsapp_messages' && t.estimated_rows > 50000
  );
  
  if (largeMessageTables.length > 0) {
    alerts.push({
      type: 'info',
      title: 'Muitas mensagens WhatsApp',
      description: `${largeMessageTables[0].estimated_rows.toLocaleString('pt-BR')} mensagens armazenadas. Considere configurar política de retenção.`,
    });
  }
  
  const largeNotifications = stats.tables.find(
    t => t.name === 'notifications' && t.estimated_rows > 10000
  );
  
  if (largeNotifications) {
    alerts.push({
      type: 'info',
      title: 'Muitas notificações',
      description: `${largeNotifications.estimated_rows.toLocaleString('pt-BR')} notificações. Considere limpar notificações lidas antigas.`,
    });
  }
  
  // Success if all good
  if (alerts.length === 0) {
    alerts.push({
      type: 'success',
      title: 'Tudo certo!',
      description: 'O banco de dados está saudável e com espaço disponível.',
    });
  }
  
  return alerts;
}

const alertStyles = {
  critical: {
    icon: XCircle,
    className: 'border-destructive/50 bg-destructive/10',
    iconClassName: 'text-destructive',
  },
  warning: {
    icon: AlertTriangle,
    className: 'border-orange-500/50 bg-orange-500/10',
    iconClassName: 'text-orange-500',
  },
  info: {
    icon: Info,
    className: 'border-blue-500/50 bg-blue-500/10',
    iconClassName: 'text-blue-500',
  },
  success: {
    icon: CheckCircle,
    className: 'border-green-500/50 bg-green-500/10',
    iconClassName: 'text-green-500',
  },
};

export function DatabaseAlerts({ stats, dbLimitGB = 8, storageLimitGB = 100 }: DatabaseAlertsProps) {
  const alerts = getAlerts(stats, dbLimitGB, storageLimitGB);
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Alertas e Recomendações
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.map((alert, index) => {
          const style = alertStyles[alert.type];
          const Icon = style.icon;
          
          return (
            <Alert key={index} className={cn(style.className)}>
              <Icon className={cn("h-4 w-4", style.iconClassName)} />
              <AlertTitle className="text-sm">{alert.title}</AlertTitle>
              <AlertDescription className="text-xs">
                {alert.description}
              </AlertDescription>
            </Alert>
          );
        })}
      </CardContent>
    </Card>
  );
}
