import { Eye, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

export function ImpersonateBanner() {
  const { impersonating, stopImpersonate } = useAuth();

  if (!impersonating) return null;

  const handleStopImpersonate = async () => {
    await stopImpersonate();
    // Use window.location instead of useNavigate to avoid Router context issues
    window.location.href = '/admin';
  };

  return (
    <div className="bg-amber-500 text-black px-4 py-2 flex items-center justify-between fixed top-0 left-0 right-0 z-50">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4" />
        <span className="font-medium">
          Visualizando como: <strong>{impersonating.orgName}</strong>
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="bg-white text-black hover:bg-gray-100"
        onClick={handleStopImpersonate}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Voltar ao Admin
      </Button>
    </div>
  );
}
