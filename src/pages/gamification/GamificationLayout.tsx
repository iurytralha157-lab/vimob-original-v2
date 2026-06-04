import { Outlet } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { AnimatedTabNav } from '@/components/ui/animated-tab-nav';
import { LayoutDashboard, TrendingUp, Settings, History, Trophy, BarChart3 } from 'lucide-react';

import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useMemo } from 'react';

export default function GamificationLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, isSuperAdmin } = useAuth();

  const tabs = useMemo(() => {
    const items = [
      { value: '/gamificacao', label: 'Arena', icon: Trophy },
      { value: '/gamificacao/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { value: '/gamificacao/performance', label: 'Rankings', icon: BarChart3 },
      { value: '/gamificacao/historico', label: 'Histórico', icon: History },
      { value: '/gamificacao/configuracoes', label: 'Admin', icon: Settings },
    ];

    if (profile?.role === 'admin' || isSuperAdmin) {
      return items;
    }

    return items.filter(i => i.value !== '/gamificacao/configuracoes');
  }, [profile?.role, isSuperAdmin]);


  const activeTab = location.pathname;

  return (
    <AppLayout title="Arena Imobiliária">
      <div className="space-y-6">
        <AnimatedTabNav 
          tabs={tabs} 
          activeTab={activeTab} 
          onTabChange={(value) => navigate(value)} 
        />
        <Outlet />
      </div>
    </AppLayout>
  );
}
