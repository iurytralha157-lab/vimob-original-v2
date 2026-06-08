import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPermissions } from '@/hooks/use-user-permissions';
import { useUserAccessScope } from '@/hooks/use-user-access-scope';

interface AdminRouteProps {
  children: React.ReactNode;
  allowedPermissions?: string[];
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
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
}
