import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPermissions } from '@/hooks/use-user-permissions';

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

  if (loading || permissionsLoading) {
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
    if (!hasAllowedPermission) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
}
