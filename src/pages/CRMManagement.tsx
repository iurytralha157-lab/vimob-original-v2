import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shuffle, Users, Tags, GitBranch } from 'lucide-react';
import { TeamPipelinesManager } from '@/components/teams/TeamPipelinesManager';
import { useIsMobile } from '@/hooks/use-mobile';
import { AnimatedTabNav, AnimatedTabItem } from '@/components/ui/animated-tab-nav';

// Tab components
import { DistributionTab } from '@/components/crm-management/DistributionTab';
import { TeamsTab } from '@/components/crm-management/TeamsTab';
import { TagsTab } from '@/components/crm-management/TagsTab';

const VALID_TABS = ['teams', 'distribution', 'pipelines', 'tags'];

export default function CRMManagement() {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    initialTab && VALID_TABS.includes(initialTab) ? initialTab : 'teams'
  );
  const isMobile = useIsMobile();

  // Sync URL ?tab= changes into state (e.g., from setup guide redirects)
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && VALID_TABS.includes(t) && t !== activeTab) {
      setActiveTab(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const managementTabs: AnimatedTabItem[] = useMemo(() => [
    { value: 'teams', label: 'Equipes', icon: Users },
    { value: 'distribution', label: 'Distribuição', icon: Shuffle },
    { value: 'pipelines', label: 'Pipelines', icon: GitBranch },
    { value: 'tags', label: 'Tags', icon: Tags },
  ], []);

  const currentTab = managementTabs.find(tab => tab.value === activeTab);
  const CurrentIcon = currentTab?.icon;

  return (
    <AppLayout title="Gestão">
      <div className="space-y-6 animate-in">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {isMobile ? (
            <Select value={activeTab} onValueChange={setActiveTab}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  <div className="flex items-center gap-2">
                    {CurrentIcon && <CurrentIcon className="h-4 w-4" />}
                    <span>{currentTab?.label}</span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {managementTabs.map(tab => (
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
            <AnimatedTabNav tabs={managementTabs} activeTab={activeTab} onTabChange={setActiveTab} />
          )}

          <TabsContent value="teams" className="mt-4">
            <TeamsTab />
          </TabsContent>

          <TabsContent value="distribution" className="mt-4">
            <DistributionTab />
          </TabsContent>

          <TabsContent value="pipelines" className="mt-4">
            <TeamPipelinesManager />
          </TabsContent>

          <TabsContent value="tags" className="mt-4">
            <TagsTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
