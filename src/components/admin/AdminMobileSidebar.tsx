import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Sheet, 
  SheetContent, 
  SheetTrigger 
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Menu,
  LayoutDashboard,
  Building2,
  Users,
  Settings,
  LogOut,
  Shield,
  Lightbulb,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSystemSettings } from '@/hooks/use-system-settings';
import { useTheme } from 'next-themes';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/admin' },
  { icon: Building2, label: 'Organizações', path: '/admin/organizations' },
  { icon: Users, label: 'Usuários', path: '/admin/users' },
  { icon: Lightbulb, label: 'Solicitações', path: '/admin/requests' },
  { icon: Settings, label: 'Configurações', path: '/admin/settings' },
];

export function AdminMobileSidebar() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const { data: systemSettings } = useSystemSettings();
  const { resolvedTheme } = useTheme();



  const logoUrl = useMemo(() => {
    if (!systemSettings) return null;
    const preferredUrl = resolvedTheme === 'dark' 
      ? systemSettings.logo_url_dark 
      : systemSettings.logo_url_light;
    return preferredUrl || systemSettings.logo_url_light || systemSettings.logo_url_dark;
  }, [systemSettings, resolvedTheme]);

  const handleNavigation = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const handleSignOut = async () => {
    await signOut();
    setOpen(false);
  };

  const isActive = (path: string) => {
    if (path === '/admin') {
      return location.pathname === '/admin';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
        {/* Logo header */}
        <div className="p-4 border-b border-border">
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt="Logo" 
              className="object-contain"
              style={{
                maxWidth: Math.min(systemSettings?.logo_width || 160, 180),
                maxHeight: Math.min(systemSettings?.logo_height || 40, 48)
              }}
            />
          ) : (
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-foreground">Super Admin</span>
            </div>
          )}
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.path}>
                <button
                  onClick={() => handleNavigation(item.path)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-colors",
                    isActive(item.path)
                      ? "bg-orange-100 dark:bg-orange-900/30 text-sidebar-foreground"
                      : "text-sidebar-foreground/70 hover:bg-orange-100 dark:hover:bg-orange-900/30 hover:text-sidebar-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-border">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-colors text-sidebar-foreground/70 hover:bg-orange-100 dark:hover:bg-orange-900/30 hover:text-sidebar-foreground"
          >
            <LogOut className="h-5 w-5" />
            <span>Sair</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
