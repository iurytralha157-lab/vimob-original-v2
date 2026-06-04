import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock, Building2, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { differenceInDays, subDays } from 'date-fns';

interface Organization {
  id: string;
  name: string;
  subscription_status: string;
  created_at: string;
  last_access_at: string | null;
}

interface Props {
  organizations: Organization[];
}

export function AdminAlerts({ organizations }: Props) {
  const navigate = useNavigate();
  
  const alerts = useMemo(() => {
    const now = new Date();
    const results = [];

    // Trials expiring in 7 days (assuming 14-day trial)
    const trialsExpiring = organizations.filter(org => {
      if (org.subscription_status !== 'trial') return false;
      const createdAt = new Date(org.created_at);
      const trialEndDate = new Date(createdAt);
      trialEndDate.setDate(trialEndDate.getDate() + 14);
      const daysUntilExpiry = differenceInDays(trialEndDate, now);
      return daysUntilExpiry >= 0 && daysUntilExpiry <= 7;
    });

    if (trialsExpiring.length > 0) {
      results.push({
        type: 'warning',
        icon: Clock,
        title: `${trialsExpiring.length} trial(s) expirando em 7 dias`,
        description: trialsExpiring.slice(0, 3).map(o => o.name).join(', '),
        orgs: trialsExpiring,
      });
    }

    // Inactive organizations (no access in 30 days)
    const thirtyDaysAgo = subDays(now, 30);
    const inactive = organizations.filter(org => {
      if (org.subscription_status === 'suspended') return false;
      if (!org.last_access_at) return true;
      const lastAccess = new Date(org.last_access_at);
      return lastAccess < thirtyDaysAgo;
    });

    if (inactive.length > 0) {
      results.push({
        type: 'info',
        icon: Building2,
        title: `${inactive.length} organização(ões) inativa(s)`,
        description: 'Sem acesso nos últimos 30 dias',
        orgs: inactive,
      });
    }

    // Suspended organizations
    const suspended = organizations.filter(org => org.subscription_status === 'suspended');
    if (suspended.length > 0) {
      results.push({
        type: 'error',
        icon: AlertTriangle,
        title: `${suspended.length} organização(ões) suspensa(s)`,
        description: suspended.slice(0, 3).map(o => o.name).join(', '),
        orgs: suspended,
      });
    }

    return results;
  }, [organizations]);

  if (alerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Alertas
          </CardTitle>
          <CardDescription>Monitoramento de situações que requerem atenção</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/20 mb-3">
              <Clock className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <p>Tudo certo! Nenhum alerta no momento.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Alertas
        </CardTitle>
        <CardDescription>Monitoramento de situações que requerem atenção</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {alerts.map((alert, index) => {
          const Icon = alert.icon;
          return (
            <div 
              key={index}
              className={`flex items-start gap-4 p-4 rounded-lg border ${
                alert.type === 'error' 
                  ? 'bg-destructive/10 border-destructive/30' 
                  : alert.type === 'warning'
                    ? 'bg-yellow-500/10 border-yellow-500/30'
                    : 'bg-blue-500/10 border-blue-500/30'
              }`}
            >
              <div className={`p-2 rounded-full ${
                alert.type === 'error' 
                  ? 'bg-destructive/20' 
                  : alert.type === 'warning'
                    ? 'bg-yellow-500/20'
                    : 'bg-blue-500/20'
              }`}>
                <Icon className={`h-4 w-4 ${
                  alert.type === 'error' 
                    ? 'text-destructive' 
                    : alert.type === 'warning'
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-blue-600 dark:text-blue-400'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{alert.title}</p>
                <p className="text-sm text-muted-foreground truncate">{alert.description}</p>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/admin/organizations')}
              >
                <Eye className="h-4 w-4 mr-1" />
                Ver
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
