import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSystemSettings } from "@/hooks/use-system-settings";

const NotFound = () => {
  const location = useLocation();
  const { data: systemSettings } = useSystemSettings();
  const bgUrl = systemSettings?.login_bg_url;

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Background image */}
      {bgUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${bgUrl})` }}
        />
      )}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Content */}
      <div className="relative z-10 text-center space-y-6 px-6">
        <p className="text-[10rem] md:text-[14rem] font-black text-white tracking-tighter leading-none">404</p>
        <p className="text-xl text-white/70 max-w-md mx-auto">
          A página que você está procurando não existe ou foi movida.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            className="border-white/30 text-white bg-white/10 hover:bg-white/20"
            onClick={() => window.history.back()}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <Button asChild className="bg-primary hover:bg-primary/90">
            <Link to="/dashboard">
              <Home className="h-4 w-4 mr-2" />
              Início
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
