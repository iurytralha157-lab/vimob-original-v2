import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardFilters } from './use-dashboard-filters';

export interface MetaCampaignInsight {
  id: string;
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  ad_id: string;
  ad_name: string;
  spend: number;
  impressions: number;
  reach: number;
  leads_count: number;
  cpl: number;
  date_start: string;
  date_stop: string;
  level: string;
  fetched_at: string;
}

export function useMetaInsights(filters: DashboardFilters) {
  const { organization } = useAuth();

  return useQuery({
    queryKey: ['meta-insights', organization?.id, filters.dateRange.from.toISOString(), filters.dateRange.to.toISOString(), filters.campaignId, filters.adSetId, filters.adId],
    enabled: !!organization?.id,
    queryFn: async () => {
      let query = supabase
        .from('meta_campaign_insights')
        .select('*')
        .eq('organization_id', organization!.id)
        .gte('date_start', filters.dateRange.from.toISOString().split('T')[0])
        .lte('date_stop', filters.dateRange.to.toISOString().split('T')[0]);

      if (filters.campaignId) query = query.eq('campaign_id', filters.campaignId);
      if (filters.adSetId) query = query.eq('adset_id', filters.adSetId);
      if (filters.adId) query = query.eq('ad_id', filters.adId);

      const { data, error } = await query.order('date_start', { ascending: false });

      if (error) throw error;
      return data as MetaCampaignInsight[];
    },
  });
}
