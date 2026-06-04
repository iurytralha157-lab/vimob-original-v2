import { Navigate } from 'react-router-dom';
import { useHasPermission } from '@/hooks/use-organization-roles';
import { useAuth } from '@/contexts/AuthContext';

interface PermissionGuardProps {
  permission: string;
  children: React.ReactNode;
  fallbackPath?: string;
}

/**
 * Guard that checks if the current user has a specific permission.
 * Admins and super admins always have access.
 * Regular users must have the permission assigned through their role.
 */
export function PermissionGuard({ 
  permission, 
  children, 
  fallbackPath = '/crm/conversas' 
}: PermissionGuardProps) {
  const { profile, isSuperAdmin, loading: authLoading } = useAuth();
  const { data: hasPermission, isLoading: permissionLoading } = useHasPermission(permission);

  // Still loading
  if (authLoading || permissionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  // Super admin always has access
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  // Admin always has access
  if (profile?.role === 'admin') {
    return <>{children}</>;
  }

  // Check permission for regular users
  if (!hasPermission) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
}
