import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface AdminRouteProps {
  children: React.ReactNode;
}

/**
 * Guard that only allows admins and team leaders to access the route.
 * Regular users are redirected to the dashboard.
 */
export function AdminRoute({ children }: AdminRouteProps) {
  const { profile, loading, isSuperAdmin } = useAuth();

  if (loading) {
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
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
