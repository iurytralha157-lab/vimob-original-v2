import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPermissions } from '@/hooks/use-user-permissions';
import { useUserAccessScope } from '@/hooks/use-user-access-scope';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface AdminRouteProps {
  children: React.ReactNode;
  allowedPermissions?: string[];
}

function AdminAccessDenied() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-6 text-center">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Acesso negado</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Esta área exige perfil administrativo ou uma permissão específica.
            </p>
          </div>
          <Button asChild>
            <Link to="/dashboard">Voltar para o dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Guard that only allows admins and team leaders to access the route.
 * Regular users are redirected to the dashboard.
 */
export function AdminRoute({ children, allowedPermissions = [] }: AdminRouteProps) {
  const { profile, loading, isSuperAdmin } = useAuth();
  const { hasPermission, isLoading: permissionsLoading } = useUserPermissions();
  const accessScope = useUserAccessScope();

  if (loading || permissionsLoading || accessScope.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  // Super admins always have access
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  // Only admins have access
  if (profile?.role !== 'admin') {
    const hasAllowedPermission = allowedPermissions.some((permission) => hasPermission(permission));
    const canAccessAsTeamLeader =
      accessScope.isTeamLeader &&
      allowedPermissions.some((permission) => ['settings_teams', 'settings_users', 'settings_pipelines'].includes(permission));

    if (!hasAllowedPermission && !canAccessAsTeamLeader) {
      return <AdminAccessDenied />;
    }
  }

  return <>{children}</>;
}
