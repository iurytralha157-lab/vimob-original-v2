import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Image as ImageIcon, 
  Share2, 
  Megaphone, 
  Wrench, 
  Bell,
  Loader2
} from 'lucide-react';
import { useSystemSettings, SystemSettingsValue } from '@/hooks/use-system-settings';
import { AnimatedTabNav, AnimatedTabItem } from '@/components/ui/animated-tab-nav';
import { useIsMobile } from '@/hooks/use-mobile';
import { MediaSettings } from '@/components/admin/settings/MediaSettings';
import { IntegrationsSettings } from '@/components/admin/settings/IntegrationsSettings';
import { InternalCommunicationSettings } from '@/components/admin/settings/InternalCommunicationSettings';
import { MaintenanceSettings } from '@/components/admin/settings/MaintenanceSettings';
import { NotificationSettings } from '@/components/admin/settings/NotificationSettings';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export default function SystemSettingsPage() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const { data: settings, isLoading, refetch } = useSystemSettings();

  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'media');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && t !== activeTab) {
      setActiveTab(t);
    }
  }, [searchParams, activeTab]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    setSearchParams(next, { replace: true });
  };

  const handleUpdate = async (updates: Partial<SystemSettingsValue>) => {
    if (!settings) return;
    
    setSaving(true);
    try {
      // Get current value from database to merge correctly
      const { data: currentData } = await supabase
        .from('system_settings')
        .select('value')
        .eq('id', settings.id)
        .single();
      
      const currentValue = (currentData?.value as any) || {};
      const newValue = { ...currentValue, ...updates };

      const { error } = await supabase
        .from('system_settings')
        .update({ value: newValue as unknown as Json })
        .eq('id', settings.id);

      if (error) throw error;
      
      await refetch();
      // Toast is usually handled by the component calling onUpdate
    } catch (error: any) {
      toast.error('Erro ao atualizar configurações: ' + error.message);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const tabs: AnimatedTabItem[] = useMemo(() => [
    { value: 'media', label: 'Mídia', icon: ImageIcon },
    { value: 'integrations', label: 'Integrações Externas', icon: Share2 },
    { value: 'maintenance', label: 'Manutenção e Atualizações', icon: Wrench },
    { value: 'notifications', label: 'Notificações', icon: Bell },
  ], []);

  const currentTab = tabs.find((t) => t.value === activeTab);
  const CurrentIcon = currentTab?.icon;

  if (authLoading || isLoading) {
    return (
      <AdminLayout title="Configurações do Sistema">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (!isSuperAdmin) {
    return <Navigate to="/admin" replace />;
  }


  return (
    <AdminLayout title="Configurações do Sistema">
      <div className="animate-in fade-in duration-500">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          {isMobile ? (
            <Select value={activeTab} onValueChange={handleTabChange}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  <div className="flex items-center gap-2">
                    {CurrentIcon && <CurrentIcon className="h-4 w-4" />}
                    <span>{currentTab?.label}</span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {tabs.map((tab) => (
                  <SelectItem key={tab.value} value={tab.value}>
                    <div className="flex items-center gap-2">
                      <tab.icon className="h-4 w-4" />
                      <span>{tab.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <AnimatedTabNav tabs={tabs} activeTab={activeTab} onTabChange={handleTabChange} />
          )}

          <TabsContent value="media" className="mt-0">
            <MediaSettings settings={settings} onUpdate={handleUpdate} />
          </TabsContent>

          <TabsContent value="integrations" className="mt-0">
            <IntegrationsSettings settings={settings} onUpdate={handleUpdate} />
          </TabsContent>


          <TabsContent value="maintenance" className="mt-0">
            <MaintenanceSettings settings={settings} onUpdate={handleUpdate} />
          </TabsContent>

          <TabsContent value="notifications" className="mt-0">
            <NotificationSettings />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
