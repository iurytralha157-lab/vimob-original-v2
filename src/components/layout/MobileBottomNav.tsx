import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Kanban,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Users,
  Calendar,
  Building2,
  DollarSign } from
'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useOrganizationModules } from '@/hooks/use-organization-modules';
import { useUserPermissions } from '@/hooks/use-user-permissions';
import { MobileSidebar } from './MobileSidebar';
import { CreateLeadDialog } from '@/components/leads/CreateLeadDialog';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { AnimatedIcon } from '@/components/icons/AnimatedIcon';
import CALENDAR_JSON from '@/components/icons/calendar-icon.json';
import AVATAR_JSON from '@/components/icons/avatar-icon.json';
import FINANCE_JSON from '@/components/icons/finance-icon.json';
import DASHBOARD_JSON from '@/components/icons/dashboard-icon.json';

interface TabItem {
  icon: any;
  labelKey: string;
  path: string;
}

export function MobileBottomNav() {
  const [createLeadOpen, setCreateLeadOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, isSuperAdmin, organization } = useAuth();
  const { t } = useLanguage();
  const { hasModule } = useOrganizationModules();
  const { hasPermission } = useUserPermissions();

  // Build the 4 visible tabs dynamically based on modules
  const tabs = useMemo(() => {
    const result: (TabItem | 'fab' | 'more')[] = [];

    // Slot 1: Dashboard (always)
    result.push({ icon: LayoutDashboard, labelKey: 'dashboard', path: '/dashboard' });

    // Slot 2: Pipelines or fallback
    if (hasModule('crm')) {
      result.push({ icon: Kanban, labelKey: 'pipelines', path: '/crm/pipelines' });
    } else if (hasModule('agenda')) {
      result.push({ icon: Calendar, labelKey: 'schedule', path: '/agenda' });
    } else if (hasModule('properties')) {
      result.push({ icon: Building2, labelKey: 'properties', path: '/properties' });
    } else if (hasModule('financial') && (profile?.role === 'admin' || isSuperAdmin)) {
      result.push({ icon: DollarSign, labelKey: 'financial', path: '/financeiro' });
    }

    // Slot 3: FAB
    result.push('fab');

    // Slot 4: Conversas or fallback
    if (hasModule('whatsapp')) {
      result.push({ icon: WhatsAppIcon, labelKey: 'conversations', path: '/crm/conversas' });
    } else if (hasModule('crm') && organization?.segment !== 'telecom') {
      result.push({ icon: Users, labelKey: 'contacts', path: '/crm/contacts' });
    } else if (hasModule('agenda') && !result.some((r) => typeof r !== 'string' && r.path === '/agenda')) {
      result.push({ icon: Calendar, labelKey: 'schedule', path: '/agenda' });
    }

    // Slot 5: More
    result.push('more');

    return result;
  }, [hasModule, profile?.role, isSuperAdmin, organization?.segment]);

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const getLabel = (labelKey: string): string => {
    return (t.nav as Record<string, string>)[labelKey] || labelKey;
  };

  const showFab = hasModule('crm');

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-end justify-around px-1 h-16 py-[4px] pb-[10px]">
          {tabs.map((tab, index) => {
            if (tab === 'fab') {
              return (
                <div key="fab" className="flex flex-col items-center justify-center -mt-4">
                  {showFab ?
                  <button
                    onClick={() => setCreateLeadOpen(true)}
                    className="h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                    aria-label="Criar lead">

                      <Plus className="h-6 w-6" />
                    </button> :

                  <div className="h-12 w-12" /> // spacer when CRM disabled
                  }
                </div>);

            }

            if (tab === 'more') {
              return (
                <MobileSidebarTab key="more" label={(t.nav as any).more || 'Mais'} />);

            }

            const active = isActive(tab.path);
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 px-1 min-w-[56px] transition-colors duration-200 active:scale-95",
                  active ? "text-primary" : "text-muted-foreground"
                )}>

                {active &&
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />
                }
                {tab.icon === WhatsAppIcon ? (
                  <WhatsAppIcon size={28} trigger={active ? 'loop-on-hover' : 'hover'} />
                ) : tab.icon === LayoutDashboard ? (
                  <AnimatedIcon icon={DASHBOARD_JSON} size={28} trigger={active ? 'loop-on-hover' : 'hover'} className="flex-shrink-0" />
                ) : tab.icon === Calendar ? (
                  <AnimatedIcon icon={CALENDAR_JSON} size={28} trigger={active ? 'loop-on-hover' : 'hover'} className="flex-shrink-0" />
                ) : tab.icon === Users ? (
                  <AnimatedIcon icon={AVATAR_JSON} size={28} trigger={active ? 'loop-on-hover' : 'hover'} className="flex-shrink-0" />
                ) : tab.icon === DollarSign ? (
                  <AnimatedIcon icon={FINANCE_JSON} size={28} trigger={active ? 'loop-on-hover' : 'hover'} className="flex-shrink-0" />
                ) : (
                  <tab.icon className="h-5 w-5" />
                )}
                <span className="text-[10px] font-medium leading-tight truncate max-w-[56px]">
                  {getLabel(tab.labelKey)}
                </span>
              </button>);

          })}
        </div>
      </nav>

      <CreateLeadDialog open={createLeadOpen} onOpenChange={setCreateLeadOpen} />
    </>);

}

// Wrapper that renders the More tab button and triggers MobileSidebar sheet
function MobileSidebarTab({ label }: {label: string;}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex flex-col items-center justify-center gap-0.5 py-2 px-1 min-w-[56px] text-muted-foreground transition-colors duration-200 active:scale-95">

        <MoreHorizontal className="h-5 w-5" />
        <span className="text-[10px] font-medium leading-tight">{label}</span>
      </button>
      <MobileSidebarSheet open={open} onOpenChange={setOpen} />
    </>);

}

// Extracted sheet from MobileSidebar, controlled externally
function MobileSidebarSheet({ open, onOpenChange }: {open: boolean;onOpenChange: (v: boolean) => void;}) {
  // We import and render MobileSidebar's Sheet content by controlling it externally
  // Since MobileSidebar manages its own Sheet, we'll use a simpler approach:
  // render MobileSidebar with controlled open state
  return <MobileSidebar externalOpen={open} onExternalOpenChange={onOpenChange} />;
}