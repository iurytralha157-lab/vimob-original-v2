import { LayoutDashboard, Kanban, Building2, Shuffle, HelpCircle, ChevronDown, ChevronLeft, ChevronRight, Users, MessageSquare, Calendar, DollarSign, FileText, Receipt, TrendingUp, BarChart3, Zap, Package, MapPin, UserCheck, Globe, PieChart, Trophy, History as HistoryIcon, CreditCard, HardHat, Workflow, Compass, ShoppingCart, Inbox } from 'lucide-react';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { AnimatedIcon } from '@/components/icons/AnimatedIcon';
import GLOBE_JSON from '@/components/icons/globe-icon.json';
import AVATAR_JSON from '@/components/icons/avatar-icon.json';
import CALENDAR_JSON from '@/components/icons/calendar-icon.json';
import FINANCE_JSON from '@/components/icons/finance-icon.json';
import MANAGEMENT_JSON from '@/components/icons/management-icon.json';
import DASHBOARD_JSON from '@/components/icons/dashboard-icon.json';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import React, { useState, useMemo } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useOrganizationModules } from '@/hooks/use-organization-modules';
import { useUserPermissions } from '@/hooks/use-user-permissions';
import { useSidebar } from '@/contexts/SidebarContext';
import { useSystemSettings } from '@/hooks/use-system-settings';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { isBillingBlockedStatus } from '@/lib/billing-access';

const DEFAULT_BRAND_ICON = "/favicon.webp?v=20260605";

interface NavItem {
  icon: React.ElementType;
  labelKey: string;
  path: string;
  module?: string;
  permission?: string;
  anyPermissions?: string[];
  adminOnly?: boolean;
  children?: NavItem[];
}
const allNavItems: NavItem[] = [{
  icon: LayoutDashboard,
  labelKey: 'dashboard',
  path: '/dashboard',
  children: [{
    icon: LayoutDashboard,
    labelKey: 'summary',
    path: '/dashboard'
  }, {
    icon: BarChart3,
    labelKey: 'campaigns',
    path: '/dashboard/campaigns',
    module: 'campaigns',
    permission: 'module_campaigns'
  }]
}, {
  icon: Kanban,
  labelKey: 'pipelines',
  path: '/crm/pipelines',
  module: 'crm'
}, {
  icon: WhatsAppIcon,
  labelKey: 'conversations',
  path: '/crm/conversas',
  module: 'whatsapp'
}, {
  icon: Users,
  labelKey: 'contacts',
  path: '/crm/contacts',
  module: 'crm'
}, {
  icon: DollarSign,
  labelKey: 'financial',
  path: '/financeiro',
  module: 'financial',
  adminOnly: true,
  children: [{
    icon: TrendingUp,
    labelKey: 'financialDashboard',
    path: '/financeiro'
  }, {
    icon: Receipt,
    labelKey: 'entries',
    path: '/financeiro/contas'
  }, {
    icon: FileText,
    labelKey: 'contracts',
    path: '/financeiro/contratos'
  }, {
    icon: DollarSign,
    labelKey: 'commissions',
    path: '/financeiro/comissoes'
  }, {
    icon: BarChart3,
    labelKey: 'reports',
    path: '/financeiro/relatorios'
  }, {
    icon: BarChart3,
    labelKey: 'dre',
    path: '/financeiro/dre'
  }, {
    icon: BarChart3,
    labelKey: 'dreExecutive',
    path: '/financeiro/dre-executivo'
  }]
}, {
  icon: Building2,

  labelKey: 'properties',
  path: '/properties',
  module: 'properties',
  children: [{
    icon: Building2,
    labelKey: 'propertiesAll',
    path: '/properties'
  }, {
    icon: Building2,
    labelKey: 'propertiesRentals',
    path: '/properties/rentals'
  }, {
    icon: Building2,
    labelKey: 'propertiesCondos',
    path: '/properties/condominiums'
  }, {
    icon: MapPin,
    labelKey: 'propertiesLocations',
    path: '/properties/locations'
  }]
},
// Telecom modules
{
  icon: Package,
  labelKey: 'plans',
  path: '/plans',
  module: 'plans'
}, {
  icon: MapPin,
  labelKey: 'coverage',
  path: '/coverage',
  module: 'coverage'
}, {
  icon: UserCheck,
  labelKey: 'telecomCustomers',
  path: '/telecom/customers',
  module: 'telecom'
},
// Admin modules
{
  icon: Shuffle,
  labelKey: 'crmManagement',
  path: '/crm/management',
  module: 'crm',
  anyPermissions: ['settings_teams', 'settings_users', 'settings_pipelines']
}, {
  icon: Calendar,
  labelKey: 'schedule',
  path: '/agenda',
  module: 'agenda'
}, {
  icon: Zap,
  labelKey: 'automations',
  path: '/automations',
  module: 'automations'
}, {
  icon: HardHat,
  labelKey: 'obras',
  path: '/obras',
  module: 'engineering',
  children: [{
    icon: LayoutDashboard,
    labelKey: 'overview',
    path: '/obras/overview'
  }, {
    icon: Building2,
    labelKey: 'construction',
    path: '/obras/obras'
  }, {
    icon: HardHat,
    labelKey: 'engineering',
    path: '/obras/engenharia'
  }, {
    icon: Compass,
    labelKey: 'architecture',
    path: '/obras/arquitetura'
  }, {
    icon: ShoppingCart,
    labelKey: 'purchase',
    path: '/obras/compras'
  }, {
    icon: DollarSign,
    labelKey: 'financial',
    path: '/obras/financeiro'
  }]
}, {
  icon: Trophy,
  labelKey: 'arena',
  path: '/gamificacao',
  module: 'gamification'
}];

const bottomItems: NavItem[] = [{
  icon: Globe,
  labelKey: 'site',
  path: '/settings/site',
  adminOnly: true,
  module: 'site'
}];

function SidebarIcon({ item, size = 20, className }: { item: NavItem; size?: number; className?: string }) {
  if (item.icon === WhatsAppIcon) {
    return <WhatsAppIcon size={size + 4} className={cn("flex-shrink-0", className)} trigger="hover" />;
  }
  if (item.icon === LayoutDashboard) {
    return <AnimatedIcon icon={DASHBOARD_JSON} size={size + 4} className={cn("flex-shrink-0", className)} trigger="hover" />;
  }
  if (item.icon === Users) {
    return <AnimatedIcon icon={AVATAR_JSON} size={size + 4} trigger="hover" className={cn("flex-shrink-0", className)} />;
  }
  if (item.icon === Calendar) {
    return <AnimatedIcon icon={CALENDAR_JSON} size={size + 4} className={cn("flex-shrink-0", className)} trigger="hover" />;
  }
  if (item.icon === DollarSign) {
    return <AnimatedIcon icon={FINANCE_JSON} size={size + 4} className={cn("flex-shrink-0", className)} trigger="hover" />;
  }
  if (item.icon === Shuffle) {
    return <AnimatedIcon icon={MANAGEMENT_JSON} size={size + 4} className={cn("flex-shrink-0", className)} trigger="hover" />;
  }
  if (item.labelKey === 'site' || item.labelKey === 'mySite') {
    return <AnimatedIcon icon={GLOBE_JSON} size={size + 6} trigger="hover" className={cn("flex-shrink-0", className)} />;
  }

  const Icon = item.icon;
  return <Icon className={cn(`h-${Math.round(size/4)} w-${Math.round(size/4)} flex-shrink-0`, className)} />;
}

export const AppSidebar = React.memo(function AppSidebar() {
  const location = useLocation();
  const {
    profile,
    isSuperAdmin,
    organization
  } = useAuth();
  const {
    t
  } = useLanguage();
  const {
    hasModule,
    isLoading: modulesLoading
  } = useOrganizationModules();
  const {
    hasPermission
  } = useUserPermissions();
  const {
    collapsed,
    toggleCollapsed
  } = useSidebar();
  const [openMenus, setOpenMenus] = useState<string[]>([]);
  const {
    data: systemSettings
  } = useSystemSettings();
  const {
    resolvedTheme
  } = useTheme();

  // Get the appropriate logo/favicon based on theme
  const logoUrl = useMemo(() => {
    if (!systemSettings) return null;
    return resolvedTheme === 'dark' ? systemSettings.logo_url_dark || systemSettings.logo_url_light : systemSettings.logo_url_light || systemSettings.logo_url_dark;
  }, [systemSettings, resolvedTheme]);
  const faviconUrl = useMemo(() => {
    return DEFAULT_BRAND_ICON;
  }, []);
  const logoWidth = systemSettings?.logo_width || 140;
  const logoHeight = systemSettings?.logo_height || 40;
  const isBillingBlocked = !isSuperAdmin && isBillingBlockedStatus(organization?.subscription_status);

  // Preload both images so swap is instant
  useMemo(() => {
    [logoUrl, faviconUrl].forEach(url => {
      if (url) {
        const img = new Image();
        img.src = url;
      }
    });
  }, [logoUrl, faviconUrl]);

  // Filter nav items based on enabled modules, user role, permissions, and organization segment
  // While modules are loading, only show items without module requirement to prevent flash
  const navItems = useMemo(() => {
    if (isBillingBlocked) {
      return [{
        icon: CreditCard,
        labelKey: 'Faturamento',
        path: '/settings?tab=subscription'
      }];
    }

    const filterItems = (items: NavItem[]): NavItem[] => {
      return items.filter(item => {
        // Module check
        if (modulesLoading && item.module) return false;
        if (item.module && !hasModule(item.module as any)) return false;
        
        // Admin only check
        if (item.adminOnly && profile?.role !== 'admin' && !isSuperAdmin) return false;
        
        // Permission check
        if (item.permission && !hasPermission(item.permission)) return false;
        if (item.anyPermissions && !item.anyPermissions.some(permission => hasPermission(permission))) return false;
        
        // Segment specific rules
        if (item.path === '/crm/contacts' && organization?.segment === 'telecom') return false;
        
        return true;
      }).map(item => {
        // Recursively filter children if they exist
        if (item.children) {
          const filteredChildren = filterItems(item.children);
          return {
            ...item,
            children: filteredChildren.length > 0 ? filteredChildren : undefined
          };
        }
        return item;
      });
    };

    return filterItems(allNavItems);
  }, [hasModule, hasPermission, profile?.role, isSuperAdmin, organization?.segment, organization?.subscription_status, modulesLoading, isBillingBlocked]);


  // Filter bottom items based on user role and modules
  // While modules are loading, hide module-dependent items to prevent flash
  const computedBottomItems = useMemo(() => {
    if (isBillingBlocked) return [];

    const items = bottomItems.filter(item => {
      if (item.adminOnly && profile?.role !== 'admin' && !isSuperAdmin) return false;
      // If modules are still loading and this item requires a module, hide it
      if (modulesLoading && item.module) return false;
      if (item.module && !hasModule(item.module as any)) return false;
      return true;
    });
    return items;
  }, [isSuperAdmin, profile?.role, hasModule, modulesLoading, isBillingBlocked]);
  const getLabel = (labelKey: string): string => {
    return (t.nav as Record<string, string>)[labelKey] || labelKey;
  };
  const toggleMenu = (path: string) => {
    setOpenMenus(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]);
  };
  const isMenuOpen = (path: string) => openMenus.includes(path);
  const isActiveParent = (item: NavItem) => {
    if (item.children) {
      return item.children.some(child => location.pathname === child.path);
    }
    return location.pathname.startsWith(item.path.split('?')[0]);
  };
  return <aside className={cn("h-[calc(100%-24px)] bg-card rounded-xl shadow-sm relative flex flex-col transition-all duration-300 m-3 flex-shrink-0 border-0", collapsed ? "w-16" : "w-56")}>
    {/* Header with Logo and Toggle */}
    <div className={cn("flex items-center px-3 pt-4 pb-3", collapsed ? "justify-center" : "justify-between")}>
      {collapsed ?
        // Collapsed: Show favicon only
        <div className="h-8 w-8 flex items-center justify-center">
          {faviconUrl ? <img src={faviconUrl} alt="Icon" className="h-8 w-8 object-contain" /> : <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
            V
          </div>}
        </div> :
        // Expanded: Show full logo + toggle button
        <>
          <div className="flex items-center">
            {logoUrl ? <img src={logoUrl} alt="Logo" style={{
              maxWidth: logoWidth,
              maxHeight: logoHeight
            }} className="object-contain" /> : <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              V
            </div>}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={toggleCollapsed}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </>}
    </div>

    {/* Floating toggle button when collapsed */}
    {collapsed && <Button variant="outline" size="icon" className="absolute -right-3 top-14 z-50 h-6 w-6 rounded-full bg-card border shadow-md flex items-center justify-center" onClick={toggleCollapsed}>
      <ChevronRight className="h-3 w-3" />
    </Button>}

    {/* Navigation */}
    <nav className="flex-1 py-3 px-2 overflow-y-auto scrollbar-thin">
      <ul className="space-y-1">
        {navItems.map(item => <li key={item.path}>
          {item.children && !collapsed ? <Collapsible open={isMenuOpen(item.path) || isActiveParent(item)} onOpenChange={() => toggleMenu(item.path)}>
            <CollapsibleTrigger asChild>
              <button className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors", "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-orange-100 dark:hover:bg-orange-900/30", isActiveParent(item) && "text-sidebar-foreground bg-orange-100 dark:bg-orange-900/30")}>
                <SidebarIcon item={item} size={20} />
                <span className="flex-1 text-left">{getLabel(item.labelKey)}</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", (isMenuOpen(item.path) || isActiveParent(item)) && "rotate-180")} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pl-4 mt-1 space-y-1">
              {item.children.map(child => <NavLink key={child.path} to={child.path} className={cn("flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors", "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-orange-100 dark:hover:bg-orange-900/30", location.pathname === child.path && "text-sidebar-foreground bg-orange-100 dark:bg-orange-900/30")}>
                <child.icon className="h-4 w-4 flex-shrink-0" />
                <span>{getLabel(child.labelKey)}</span>
              </NavLink>)}
            </CollapsibleContent>
          </Collapsible> : <NavLink to={item.children ? item.children[0].path : item.path} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors", "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-orange-100 dark:hover:bg-orange-900/30", (item.children ? isActiveParent(item) : location.pathname.startsWith(item.path.split('?')[0])) && "text-sidebar-foreground bg-orange-100 dark:bg-orange-900/30", collapsed && "justify-center")}>
            <SidebarIcon item={item} size={20} />
            {!collapsed && <span>{getLabel(item.labelKey)}</span>}
          </NavLink>}
        </li>)}
      </ul>
    </nav>

    {/* Bottom items */}
    <div className="py-3 px-2">
      <ul className="space-y-1">
        {computedBottomItems.map(item => <li key={item.path}>
          <NavLink to={item.path} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors", "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-orange-100 dark:hover:bg-orange-900/30", location.pathname === item.path && "text-sidebar-foreground bg-orange-100 dark:bg-orange-900/30", collapsed && "justify-center")}>
            <SidebarIcon item={item} size={20} />
            {!collapsed && <span>{getLabel(item.labelKey)}</span>}
          </NavLink>
        </li>)}
      </ul>
    </div>
  </aside>;
});
