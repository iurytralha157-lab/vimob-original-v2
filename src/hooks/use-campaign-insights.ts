import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { DashboardFilters } from "@/hooks/use-dashboard-filters";
import { applyLeadIdFilter, fetchDashboardTeamLeadIds } from "@/hooks/use-dashboard-team-leads";

export interface CampaignAggregated {
  campaign_id: string;
  campaign_name: string;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  leads_count: number;
  conversations_count: number;
  won_count: number;
  revenue: number;
  cpl: number | null;
  status: string | null;
  budget: number | null;
  budget_type: string | null;
  objective: string | null;
  adsets: AdsetAggregated[];
}

export interface AdsetAggregated {
  adset_id: string;
  adset_name: string;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  leads_count: number;
  won_count: number;
  revenue: number;
  cpl: number | null;
  ads: AdAggregated[];
}

export interface AdAggregated {
  ad_id: string;
  ad_name: string;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  leads_count: number;
  won_count: number;
  revenue: number;
  cpl: number | null;
  creative_url: string | null;
  creative_video_url: string | null;
}

export interface TopCreative {
  ad_id: string;
  ad_name: string;
  campaign_name: string;
  leads_count: number;
  won_count: number;
  revenue: number;
  score: number;
  creative_url: string | null;
  creative_video_url: string | null;
  spend: number | null;
  cpl: number | null;
}

interface LeadMetaRow {
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  creative_url: string | null;
  creative_video_url: string | null;
  lead_id: string;
}

interface InsightRow {
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  level: string;
  spend: number;
  impressions: number;
  reach: number;
  leads_count: number;
  conversations_count: number;
  cpl: number;
  status: string | null;
  budget: number | null;
  budget_type: string | null;
  objective: string | null;
  fetched_at: string;
  date_start: string;
  date_stop: string;
  creative_url?: string | null;
  creative_video_url?: string | null;
}

interface LeadRow {
  id: string;
  deal_status: string | null;
  valor_interesse: number | null;
}

// Build hierarchy from lead_meta (primary), enrich with meta_campaign_insights (optional)
export function useCampaignInsights(filters: DashboardFilters) {
  const { profile } = useAuth();
  const dateFrom = filters.dateRange.from.toISOString();
  const dateTo = filters.dateRange.to.toISOString();

  return useQuery({
    queryKey: ["campaign-insights", profile?.organization_id, dateFrom, dateTo, filters.teamId, filters.userId, filters.source],
    queryFn: async () => {
      if (!profile?.organization_id) return null;
      const orgId = profile.organization_id;

      // 0. If team filter, resolve leads by real distribution team.
      const teamLeadIds = await fetchDashboardTeamLeadIds(filters.teamId, null);
      if (teamLeadIds !== null && teamLeadIds.length === 0) {
        return emptyResult();
      }

      // 1. Get all lead_meta with campaign_id
      const { data: leadMetaRaw } = await supabase
        .from("lead_meta")
        .select("campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, creative_url, creative_video_url, lead_id")
        .not("campaign_id", "is", null);

      const validLeadIds = new Set<string>();
      const wonLeadIds = new Set<string>();
      const leadRevenueMap = new Map<string, number>();
      const dailyDataMap = new Map<string, { leads: number; conversations: number }>();

      // 2. Filter leads by date range (if any exist)
      if (leadMetaRaw && leadMetaRaw.length > 0) {
        const leadIds = leadMetaRaw.map(lm => lm.lead_id);
        const batchSize = 500;
        for (let i = 0; i < leadIds.length; i += batchSize) {
          const batch = leadIds.slice(i, i + batchSize);
          let query = supabase
            .from("leads")
            .select("id, deal_status, valor_interesse, created_at")
            .in("id", batch)
            .eq("organization_id", orgId)
            .gte("created_at", dateFrom)
            .lte("created_at", dateTo);

          query = applyLeadIdFilter(query, teamLeadIds);
          if (filters.userId) query = query.eq("assigned_user_id", filters.userId);
          if (filters.source && filters.source !== "all") query = query.eq("source", filters.source);

          const { data: leadsInRange } = await query;
          ((leadsInRange || []) as any[]).forEach(l => {
            validLeadIds.add(l.id);
            if (l.deal_status === 'won') {
              wonLeadIds.add(l.id);
              leadRevenueMap.set(l.id, l.valor_interesse || 0);
            }
            
            // Daily aggregation for leads
            const dayKey = l.created_at.split('T')[0];
            const current = dailyDataMap.get(dayKey) || { leads: 0, conversations: 0 };
            dailyDataMap.set(dayKey, { ...current, leads: current.leads + 1 });
          });
        }
      }

      const filtered = (leadMetaRaw || []).filter(lm => validLeadIds.has(lm.lead_id));

      // 3. Build hierarchy from lead_meta
      const campaignMap = new Map<string, {
        name: string;
        leads: Set<string>;
        won: Set<string>;
        revenue: number;
        adsets: Map<string, {
          name: string;
          leads: Set<string>;
          won: Set<string>;
          revenue: number;
          ads: Map<string, {
            name: string;
            leads: Set<string>;
            won: Set<string>;
            revenue: number;
            creative_url: string | null;
            creative_video_url: string | null;
          }>;
        }>;
      }>();

      for (const lm of filtered) {
        const cId = lm.campaign_id || "unknown";
        const isWon = wonLeadIds.has(lm.lead_id);
        const rev = leadRevenueMap.get(lm.lead_id) || 0;

        if (!campaignMap.has(cId)) {
          campaignMap.set(cId, { name: lm.campaign_name || "Sem nome", leads: new Set(), won: new Set(), revenue: 0, adsets: new Map() });
        }
        const campaign = campaignMap.get(cId)!;
        if (!campaign.leads.has(lm.lead_id)) {
          campaign.leads.add(lm.lead_id);
          if (isWon) { campaign.won.add(lm.lead_id); campaign.revenue += rev; }
        }

        if (lm.adset_id) {
          if (!campaign.adsets.has(lm.adset_id)) {
            campaign.adsets.set(lm.adset_id, { name: lm.adset_name || "Sem nome", leads: new Set(), won: new Set(), revenue: 0, ads: new Map() });
          }
          const adset = campaign.adsets.get(lm.adset_id)!;
          if (!adset.leads.has(lm.lead_id)) {
            adset.leads.add(lm.lead_id);
            if (isWon) { adset.won.add(lm.lead_id); adset.revenue += rev; }
          }

          if (lm.ad_id) {
            if (!adset.ads.has(lm.ad_id)) {
              adset.ads.set(lm.ad_id, { name: lm.ad_name || "Sem nome", leads: new Set(), won: new Set(), revenue: 0, creative_url: lm.creative_url, creative_video_url: lm.creative_video_url });
            }
            const ad = adset.ads.get(lm.ad_id)!;
            if (!ad.leads.has(lm.lead_id)) {
              ad.leads.add(lm.lead_id);
              if (isWon) { ad.won.add(lm.lead_id); ad.revenue += rev; }
            }
            if (lm.creative_url) ad.creative_url = lm.creative_url;
            if (lm.creative_video_url) ad.creative_video_url = lm.creative_video_url;
          }
        }
      }

      // 4. Optionally fetch spend data from meta_campaign_insights
      const dateFromDate = filters.dateRange.from.toISOString().split("T")[0];
      const dateToDate = filters.dateRange.to.toISOString().split("T")[0];

      const { data: insightsRaw } = await (supabase as any)
        .from("meta_campaign_insights")
        .select("campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, level, spend, impressions, reach, leads_count, conversations_count, cpl, status, budget, budget_type, fetched_at, creative_url, creative_video_url, date_start, date_stop")
        .eq("organization_id", orgId)
        .gte("date_start", dateFromDate)
        .lte("date_stop", dateToDate);

      const insights = (insightsRaw || []) as InsightRow[];
      const hasSpendData = insights.length > 0;

      // Index insights by level+id
      const spendByCampaign = new Map<string, InsightRow>();
      const spendByAdset = new Map<string, InsightRow>();
      const spendByAd = new Map<string, InsightRow>();
      let lastSync: string | null = null;

      for (const ins of insights) {
        if (ins.fetched_at && (!lastSync || ins.fetched_at > lastSync)) lastSync = ins.fetched_at;
        
        // Aggregate conversations from daily insights
        if (ins.date_start === ins.date_stop) {
          const dayKey = ins.date_start;
          const current = dailyDataMap.get(dayKey) || { leads: 0, conversations: 0 };
          dailyDataMap.set(dayKey, { ...current, conversations: current.conversations + (ins.conversations_count || 0) });
        }

        if (ins.level === "campaign" && ins.campaign_id) spendByCampaign.set(ins.campaign_id, ins);
        if (ins.level === "adset" && ins.adset_id) spendByAdset.set(ins.adset_id, ins);
        if (ins.level === "ad" && ins.ad_id) spendByAd.set(ins.ad_id, ins);
      }

      // 5. Merge into final structure (Prioritizing insights data to show historical campaigns)
      const campaigns: CampaignAggregated[] = [];
      const processedCampaignIds = new Set<string>();
      let totalAdsetsCount = 0;
      let totalAdsCount = 0;

      // First, add all campaigns found in meta_campaign_insights (The Direct Meta Data)
      for (const [cId, cInsight] of spendByCampaign) {
        processedCampaignIds.add(cId);
        const cData = campaignMap.get(cId);
        const adsets: AdsetAggregated[] = [];

        // Add adsets from insights
        for (const [asId, asInsight] of spendByAdset) {
          if (asInsight.campaign_id !== cId) continue;
          const asData = cData?.adsets.get(asId);
          const ads: AdAggregated[] = [];

          // Add ads from insights
          for (const [adId, adInsight] of spendByAd) {
            if (adInsight.adset_id !== asId) continue;
            const adData = asData?.ads.get(adId);
            
            ads.push({
              ad_id: adId,
              ad_name: adInsight.ad_name || adData?.name || "Anúncio",
              spend: adInsight.spend,
              impressions: adInsight.impressions,
              reach: adInsight.reach,
              leads_count: adData?.leads.size || 0,
              won_count: adData?.won.size || 0,
              revenue: adData?.revenue || 0,
              cpl: adInsight.cpl,
              creative_url: adData?.creative_url || adInsight.creative_url,
              creative_video_url: adData?.creative_video_url || adInsight.creative_video_url,
            });
            totalAdsCount++;
          }

          adsets.push({
            adset_id: asId,
            adset_name: asInsight.adset_name || asData?.name || "Conjunto",
            spend: asInsight.spend,
            impressions: asInsight.impressions,
            reach: asInsight.reach,
            leads_count: asData?.leads.size || 0,
            won_count: asData?.won.size || 0,
            revenue: asData?.revenue || 0,
            cpl: asInsight.cpl,
            ads: ads.sort((a, b) => (b.spend || 0) - (a.spend || 0)),
          });
          totalAdsetsCount++;
        }

        campaigns.push({
          campaign_id: cId,
          campaign_name: cInsight.campaign_name || cData?.name || "Campanha",
          spend: cInsight.spend,
          impressions: cInsight.impressions,
          reach: cInsight.reach,
          leads_count: cData?.leads.size || 0,
          conversations_count: cInsight.conversations_count || 0,
          won_count: cData?.won.size || 0,
          revenue: cData?.revenue || 0,
          cpl: cInsight.cpl,
          status: cInsight.status,
          budget: cInsight.budget,
          budget_type: cInsight.budget_type,
          objective: cInsight.objective || null,
          adsets: adsets.sort((a, b) => (b.spend || 0) - (a.spend || 0)),
        });
      }

      // Add remaining campaigns that have leads but no spend data
      for (const [cId, cData] of campaignMap) {
        if (processedCampaignIds.has(cId)) continue;
        // ... (existing logic for campaigns with only leads can go here if needed)
      }

      campaigns.sort((a, b) => b.leads_count - a.leads_count);

      // Build top creatives ranking
      const allAds: TopCreative[] = [];
      for (const c of campaigns) {
        for (const as of c.adsets) {
          for (const ad of as.ads) {
            allAds.push({
              ad_id: ad.ad_id,
              ad_name: ad.ad_name,
              campaign_name: c.campaign_name,
              leads_count: ad.leads_count,
              won_count: ad.won_count,
              revenue: ad.revenue,
              score: ad.leads_count + (ad.won_count * 10),
              creative_url: ad.creative_url,
              creative_video_url: ad.creative_video_url,
              spend: ad.spend,
              cpl: ad.cpl,
            });
          }
        }
      }
      allAds.sort((a, b) => b.score - a.score);
      const topCreatives = allAds.slice(0, 10);

      const totalLeads = campaigns.reduce((s, c) => s + c.leads_count, 0);
      const totalWon = campaigns.reduce((s, c) => s + c.won_count, 0);
      const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
      const totalSpend = hasSpendData ? campaigns.reduce((s, c) => s + (c.spend || 0), 0) : null;
      const totalImpressions = hasSpendData ? campaigns.reduce((s, c) => s + (c.impressions || 0), 0) : null;
      const totalReach = hasSpendData ? campaigns.reduce((s, c) => s + (c.reach || 0), 0) : null;
      const avgCpl = hasSpendData && totalLeads > 0 && totalSpend ? Math.round((totalSpend / totalLeads) * 100) / 100 : null;

      return {
        campaigns,
        topCreatives,
        dailyData: Array.from(dailyDataMap.entries()).map(([date, data]) => ({
          date,
          ...data,
          total: data.leads + data.conversations
        })).sort((a, b) => a.date.localeCompare(b.date)),
        summary: {
          totalLeads,
          totalWon,
          totalRevenue,
          totalCampaigns: campaigns.length,
          totalAdsets: totalAdsetsCount,
          totalAds: totalAdsCount,
          totalSpend,
          avgCpl,
          totalImpressions,
          totalReach,
          conversations_count: campaigns.reduce((s, c) => s + (c.conversations_count || 0), 0),
        },
        lastSync,
        hasSpendData,
      };
    },
    enabled: !!profile?.organization_id,
    staleTime: 5 * 60 * 1000,
  });
}

function emptyResult() {
  return {
    campaigns: [],
    topCreatives: [],
    dailyData: [],
    summary: {
      totalLeads: 0,
      totalWon: 0,
      totalRevenue: 0,
      totalCampaigns: 0,
      totalAdsets: 0,
      totalAds: 0,
      totalSpend: null,
      avgCpl: null,
      totalImpressions: null,
      totalReach: null,
      conversations_count: 0,
    },
    lastSync: null,
    hasSpendData: false,
  };
}

// Sync insights from Meta API
export function useSyncCampaignInsights() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dateStart, dateStop }: { dateStart: string; dateStop: string }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(
        `https://iemalzlfnbouobyjwlwi.supabase.co/functions/v1/meta-campaign-insights`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session?.access_token}`,
          },
          body: JSON.stringify({ date_start: dateStart, date_stop: dateStop }),
        }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Falha ao sincronizar dados");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["campaign-insights"] });
      toast.success(`${data.synced} registros sincronizados do Meta Ads`);
    },
    onError: (error: Error) => {
      toast.error(`Erro ao sincronizar: ${error.message}`);
    },
  });
}
