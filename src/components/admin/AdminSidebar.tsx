import { 
  LayoutDashboard, 
  Building2, 
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Shield,
  Lightbulb,
  Package,
  Megaphone,
  HelpCircle,
  Database,
  ClipboardList,
  Bell,
  Bot
} from 'lucide-react';

import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useState, useMemo } from 'react';
import { useSystemSettings } from '@/hooks/use-system-settings';
import { useTheme } from 'next-themes';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/admin' },
  { icon: Building2, label: 'Organizações', path: '/admin/organizations' },
  { icon: Users, label: 'Usuários', path: '/admin/users' },
  { icon: Package, label: 'Planos', path: '/admin/plans' },
  { icon: ClipboardList, label: 'Onboarding', path: '/admin/onboarding' },
  { icon: Lightbulb, label: 'Solicitações', path: '/admin/requests' },
  { icon: Megaphone, label: 'Comunicados', path: '/admin/announcements' },
  { icon: Bot, label: 'Jenny IA', path: '/admin/ai' },
  { icon: HelpCircle, label: 'Central de Ajuda', path: '/admin/help-editor' },
  { icon: Settings, label: 'Configurações', path: '/admin/settings' },
];

export function AdminSidebar() {
  const location = useLocation();
  const { signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const { data: systemSettings } = useSystemSettings();
  const { resolvedTheme } = useTheme();



  const logoUrl = useMemo(() => {
    if (!systemSettings) return null;
    const preferredUrl = resolvedTheme === 'dark' 
      ? systemSettings.logo_url_dark 
      : systemSettings.logo_url_light;
    return preferredUrl || systemSettings.logo_url_light || systemSettings.logo_url_dark;
  }, [systemSettings, resolvedTheme]);

  const faviconUrl = useMemo(() => {
    if (!systemSettings) return null;
    const preferredUrl = resolvedTheme === 'dark'
      ? systemSettings.favicon_url_dark
      : systemSettings.favicon_url_light;
    return preferredUrl || systemSettings.favicon_url_light || systemSettings.favicon_url_dark;
  }, [systemSettings, resolvedTheme]);

  const logoWidth = systemSettings?.logo_width || 140;
  const logoHeight = systemSettings?.logo_height || 40;

  return (
    <div className="relative h-[calc(100%-24px)] m-3 flex-shrink-0">
      <aside 
        className={cn(
          "h-full bg-card rounded-xl relative flex flex-col transition-all duration-300 shadow-sm border-0",
          collapsed ? "w-16" : "w-56"
        )}
      >
        {/* Logo */}
        <div className={cn("flex items-center px-3 pt-4 pb-3 border-b border-border/10", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed && (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {logoUrl ? (
                <img 
                  src={logoUrl} 
                  alt="Logo" 
                  style={{ maxWidth: logoWidth, maxHeight: logoHeight }}
                  className="object-contain"
                />
              ) : (
                <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
                  V
                </div>
              )}
            </div>
          )}
          {collapsed && (
            <div className="flex items-center justify-center w-full">
              {faviconUrl ? (
                <img 
                  src={faviconUrl} 
                  alt="Logo" 
                  className="h-8 w-8 object-contain"
                />
              ) : logoUrl ? (
                <img 
                  src={logoUrl} 
                  alt="Logo" 
                  className="h-8 w-8 object-contain"
                />
              ) : (
                <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
                  V
                </div>
              )}
            </div>
          )}
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setCollapsed(true)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 overflow-y-auto scrollbar-thin">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === '/admin'}
                  className={({ isActive }) => cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                    "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-orange-100 dark:hover:bg-orange-900/30",
                    isActive && "text-sidebar-foreground bg-orange-100 dark:bg-orange-900/30",
                    collapsed && "justify-center"
                  )}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="py-3 px-2 border-t border-border">
          <button
            onClick={signOut}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
              "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-orange-100 dark:hover:bg-orange-900/30",
              collapsed && "justify-center"
            )}
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>

      {/* Floating toggle button when collapsed */}
      {collapsed && (
        <Button
          variant="outline"
          size="icon"
          className="absolute -right-3 top-14 z-50 h-6 w-6 rounded-full bg-card border shadow-md flex items-center justify-center"
          onClick={() => setCollapsed(false)}
        >
          <ChevronRight className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
