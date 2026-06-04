import { Navigate } from 'react-router-dom';
import { useOrganizationModules, ModuleName } from '@/hooks/use-organization-modules';

interface ModuleGuardProps {
  module: ModuleName;
  children: React.ReactNode;
}

export function ModuleGuard({ module, children }: ModuleGuardProps) {
  const { hasModule, isLoading } = useOrganizationModules();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!hasModule(module)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
