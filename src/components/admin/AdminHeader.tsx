import React from 'react';
import { Bell, Moon, Sun, Loader2, LogOut, ChevronDown, UserPlus, CheckSquare, FileText, DollarSign, Info, Settings, HelpCircle, Shield, Building2, Check, Key, Home, LayoutDashboard, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from 'next-themes';
import { useNotifications, useUnreadNotificationsCount, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/hooks/use-notifications';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getNotificationRoute } from '@/lib/notification-routing';

const notificationIcons: Record<string, typeof Bell> = {
  lead: UserPlus,
  task: CheckSquare,
  contract: FileText,
  commission: DollarSign,
  onboarding_request: ClipboardList,
  system: Bell,
  info: Info
};

interface AdminHeaderProps {
  title?: string;
}

export const AdminHeader = React.memo(function AdminHeader({
  title
}: AdminHeaderProps) {
  const {
    profile,
    signOut,
    impersonating,
    stopImpersonate,
  } = useAuth();
  const {
    setTheme,
    resolvedTheme
  } = useTheme();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const {
    data: notifications = [],
    isLoading
  } = useNotifications();
  const {
    data: unreadCount = 0
  } = useUnreadNotificationsCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  
  const handleNotificationClick = (notification: any) => {
    markRead.mutate(notification.id);
    if (notification.type === 'onboarding_request') {
      navigate('/admin/onboarding');
      return;
    }
    const route = getNotificationRoute(notification);
    if (route) navigate(route);
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <header className="sticky top-0 z-40 h-16 flex items-center px-4 md:px-6 bg-background/80 backdrop-blur-md border-b border-border/10">
      {/* Page title - aligned with content */}
      {title && <h1 className="text-xl font-bold text-foreground ml-2 lg:ml-0 tracking-tight">{title}</h1>}

      {/* Right side actions - Capsule style redesign */}
      <div className="flex items-center gap-3 ml-auto">
        {/* Theme toggle circle */}
        <button 
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')} 
          className="h-10 w-10 rounded-full bg-card dark:bg-[#111] transition-all duration-300 flex items-center justify-center border border-border/10"
        >
          {resolvedTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        {/* Notifications circle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="relative h-10 w-10 rounded-full bg-card dark:bg-[#111] transition-all duration-300 border border-border/10 hover:bg-card"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center border-2 border-background">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={12} collisionPadding={16} className="w-[calc(100vw-2rem)] sm:w-80 max-w-[380px] bg-popover/95 backdrop-blur-md rounded-2xl p-1 border-border/50">
            <div className="px-4 py-3 border-b border-border/40">
              <p className="font-semibold text-sm">Notificações</p>
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : notifications.length > 0 ? (
              <>
                <div className="max-h-[70vh] overflow-y-auto scrollbar-thin">
                  {notifications.slice(0, 5).map(notification => {
                    const NotificationIcon = notificationIcons[notification.type] || Bell;
                    return (
                      <DropdownMenuItem key={notification.id} className="p-3 cursor-pointer rounded-xl m-1" onClick={() => handleNotificationClick(notification)}>
                        <div className={`flex items-start gap-3 w-full ${notification.is_read ? 'opacity-60' : ''}`}>
                          <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${notification.is_read ? 'bg-muted' : 'bg-primary/10'}`}>
                            <NotificationIcon className={`h-4 w-5 ${notification.is_read ? 'text-muted-foreground' : 'text-primary'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`text-sm truncate ${!notification.is_read ? 'font-semibold' : ''}`}>
                                {notification.title}
                              </p>
                              {!notification.is_read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                            </div>
                            {notification.content && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notification.content}</p>}
                            <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                              {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: ptBR })}
                            </p>
                          </div>
                        </div>
                      </DropdownMenuItem>
                    );
                  })}
                </div>
                <DropdownMenuSeparator className="my-1 border-border/40" />
                <div className="p-2 flex gap-2">
                  {unreadCount > 0 && (
                    <Button variant="ghost" size="sm" className="flex-1 text-[11px] h-8 rounded-lg" onClick={() => markAllRead.mutate()}>
                      Marcar todas como lidas
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="flex-1 text-[11px] h-8 rounded-lg" onClick={() => navigate('/notifications')}>
                    Ver todas
                  </Button>
                </div>
              </>
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Nenhuma notificação
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Capsule */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              className="h-12 gap-3 pl-1.5 pr-2 rounded-full bg-card dark:bg-[#111] transition-all duration-300 group border border-border/10 hover:bg-card"
            >
              <Avatar className="h-9 w-9 border border-border/40 dark:border-white/10 ring-2 ring-primary/10 group-hover:ring-primary/20 transition-all">
                <AvatarImage src={profile?.avatar_url || undefined} className="object-cover" />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                  {profile?.name ? getInitials(profile.name) : 'U'}
                </AvatarFallback>
              </Avatar>
              {!isMobile && (
                <div className="flex flex-col items-start gap-0.5 pr-1 text-left">
                  <span className="text-xs font-bold text-foreground tracking-tight leading-none truncate max-w-[130px]">
                    {profile?.name || 'Super Admin'}
                  </span>
                  <span className="text-[10px] text-muted-foreground/80 leading-none truncate max-w-[130px]">
                    {profile?.email || 'admin@sistema.com'}
                  </span>
                </div>
              )}
              <div className="h-7 w-7 rounded-full bg-secondary/80 dark:bg-white/10 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 flex-shrink-0">
                <ChevronDown className="h-3 w-3" />
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={12} collisionPadding={16} className="w-56 bg-popover/95 backdrop-blur-md rounded-2xl p-1 border-border/50">
            <div className="px-3 py-3 border-b border-border/40">
              <p className="text-sm font-bold truncate">{profile?.name || 'Super Admin'}</p>
              <p className="text-[10px] text-muted-foreground truncate">{profile?.email}</p>
            </div>
            <div className="mt-1">
              {impersonating && (
                <DropdownMenuItem onClick={() => stopImpersonate()} className="cursor-pointer rounded-xl m-1 px-3 py-2 text-sm gap-2">
                  <Home className="h-4 w-4 text-muted-foreground" />
                  Voltar ao Admin
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => navigate('/admin/settings')} className="cursor-pointer rounded-xl m-1 px-3 py-2 text-sm gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                Configurações
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/dashboard')} className="cursor-pointer rounded-xl m-1 px-3 py-2 text-sm gap-2">
                <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                Dashboard Cliente
              </DropdownMenuItem>
              
              <div className="px-4 py-2 mt-1 border-t border-border/20 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground/60">Versão</span>
                <span className="text-[10px] font-medium text-muted-foreground/80">v2.2.2</span>
              </div>
            </div>
            <DropdownMenuSeparator className="my-1 border-border/40" />
            <DropdownMenuItem 
              onClick={async () => {
                try {
                  await signOut();
                } catch (error) {
                  console.error('Erro no logout:', error);
                }
                window.location.href = '/auth';
              }} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:bg-destructive/90 cursor-pointer rounded-xl m-1 px-3 py-2 text-sm gap-2 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
});
