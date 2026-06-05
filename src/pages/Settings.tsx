import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from
'@/components/ui/select';
import { UserCog, User, Plug, CreditCard } from 'lucide-react';
import { AnimatedIcon } from '@/components/icons/AnimatedIcon';
import AVATAR_JSON from '@/components/icons/avatar-icon.json';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { AccountTab } from '@/components/settings/AccountTab';
import { TeamTab } from '@/components/settings/TeamTab';
import { useOrganizationModules } from '@/hooks/use-organization-modules';
import { useIsMobile } from '@/hooks/use-mobile';
import { AnimatedTabNav, AnimatedTabItem } from '@/components/ui/animated-tab-nav';
import { SubscriptionTab } from '@/components/settings/SubscriptionTab';
import { IntegrationsTab } from '@/components/settings/IntegrationsTab';
import { isBillingBlockedStatus } from '@/lib/billing-access';

export default function Settings() {
  const { profile, isSuperAdmin, organization } = useAuth();
  const { hasModule } = useOrganizationModules();
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') || 'account';
  const normalizedRequestedTab = requestedTab === 'webhook' ? 'webhooks' : requestedTab;
  const legacyIntegrationTabs = ['webhooks', 'meta', 'whatsapp', 'ai-agent', 'api'];
  const initialIntegration = legacyIntegrationTabs.includes(normalizedRequestedTab) ? normalizedRequestedTab : undefined;
  const initialTab = initialIntegration ? 'integrations' : requestedTab;
  const [activeTab, setActiveTab] = useState(initialTab);
  const isBillingBlocked = !isSuperAdmin && isBillingBlockedStatus(organization?.subscription_status);

  // Sync tab when URL query param changes (e.g. external navigation)
  useEffect(() => {
    if (isBillingBlocked) {
      if (activeTab !== 'subscription') setActiveTab('subscription');
      if (searchParams.get('tab') !== 'subscription') {
        const next = new URLSearchParams(searchParams);
        next.set('tab', 'subscription');
        setSearchParams(next, { replace: true });
      }
      return;
    }

    const rawTab = searchParams.get('tab');
    const t = rawTab === 'webhook' ? 'webhooks' : rawTab;
    const normalizedTab = t && legacyIntegrationTabs.includes(t) ? 'integrations' : t;
    if (normalizedTab && normalizedTab !== activeTab) {
      setActiveTab(normalizedTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isBillingBlocked, activeTab, setSearchParams]);

  const handleTabChange = (value: string) => {
    if (isBillingBlocked && value !== 'subscription') return;
    setActiveTab(value);
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    setSearchParams(next, { replace: true });
  };

  const hasWhatsAppModule = hasModule('whatsapp');
  const hasWebhooksModule = hasModule('webhooks');
  const hasAIAgentModule = hasModule('ai_agent');
  const hasAPIModule = hasModule('api');

  const settingsTabs: AnimatedTabItem[] = useMemo(() => {
    if (isBillingBlocked) {
      return [{ value: 'subscription', label: 'Faturamento', icon: CreditCard }];
    }

    const tabs: AnimatedTabItem[] = [
      { value: 'account', label: 'Conta', icon: User,
        renderIcon: () => <AnimatedIcon icon={AVATAR_JSON} size={18} trigger="hover" /> },
    ];

    // Only admins and super admins can see the Users tab
    if (profile?.role === 'admin' || isSuperAdmin) {
      tabs.push({ value: 'team', label: 'Gest\u00e3o de Usu\u00e1rios', icon: UserCog });
      
      // Assinatura only for admins and not for organizations in trial
      if (organization?.subscription_status !== 'trial' && organization?.subscription_status !== 'trialing') {
        tabs.push({ value: 'subscription', label: 'Faturamento', icon: CreditCard });
      }
    }

    tabs.push({ value: 'integrations', label: 'Integrações', icon: Plug });

    return tabs;
  }, [t, profile?.role, isSuperAdmin, organization?.subscription_status, isBillingBlocked]);

  const currentTab = settingsTabs.find((tab) => tab.value === activeTab);
  const CurrentIcon = currentTab?.icon;

  return (
    <AppLayout title={t.settings.title}>
      <div className="animate-in">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          {isMobile ? (
            <Select value={activeTab} onValueChange={handleTabChange}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  <div className="flex items-center gap-2">
                    {currentTab?.renderIcon ? currentTab.renderIcon() : CurrentIcon && <CurrentIcon className="h-4 w-4" />}
                    <span>{currentTab?.label}</span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {settingsTabs.map((tab) => (
                  <SelectItem key={tab.value} value={tab.value}>
                    <div className="flex items-center gap-2">
                      {tab.renderIcon ? tab.renderIcon() : <tab.icon className="h-4 w-4" />}
                      <span>{tab.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <AnimatedTabNav tabs={settingsTabs} activeTab={activeTab} onTabChange={handleTabChange} />
          )}

          <TabsContent value="account">
            <AccountTab />
          </TabsContent>


          <TabsContent value="team">
            <TeamTab />
          </TabsContent>

          <TabsContent value="integrations">
            <IntegrationsTab
              defaultIntegration={initialIntegration}
              hasWhatsAppModule={hasWhatsAppModule}
              hasWebhooksModule={hasWebhooksModule}
              hasAIAgentModule={hasAIAgentModule}
              hasAPIModule={hasAPIModule}
            />
          </TabsContent>

          <TabsContent value="subscription">
            <SubscriptionTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}


