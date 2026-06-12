import { Link } from 'react-router-dom';
import { useHasPermission } from '@/hooks/use-organization-roles';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface PermissionGuardProps {
  permission: string;
  children: React.ReactNode;
  fallbackPath?: string;
}

function AccessDenied({ fallbackPath }: { fallbackPath: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-6 text-center">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Acesso negado</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Seu cargo não possui permissão para acessar esta área.
            </p>
          </div>
          <Button asChild>
            <Link to={fallbackPath}>Voltar para uma área permitida</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
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
    return <AccessDenied fallbackPath={fallbackPath} />;
  }

  return <>{children}</>;
}
