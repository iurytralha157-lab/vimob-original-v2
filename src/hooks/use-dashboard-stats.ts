import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { performanceTracker } from "@/lib/performance";
import {
  addDays,
  addHours,
  subDays,
  format,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  differenceInDays,
  isSameDay,
  startOfDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { DashboardFilters, sourceLabels } from "./use-dashboard-filters";
import { useAuth } from "@/contexts/AuthContext";
import { checkLeadVisibility, applyVisibilityFilter } from "./use-lead-visibility";
import { applyLeadIdFilter, fetchDashboardTeamLeadIds } from "./use-dashboard-team-leads";

export interface DealsEvolutionPoint {
  date: string;
  ganhos: number;
  perdas: number;
  abertos: number;
}

export interface DashboardStats {
  totalLeads: number;
  leadsInProgress: number;
  leadsClosed: number;
  leadsLost: number;
  leadsTrend: number;
  closedTrend: number;
}

export interface EnhancedDashboardStats {
  totalLeads: number;
  openLeads: number;
  lostLeads: number;
  conversionRate: number;
  closedLeads: number;
  wonAverageConversionDays: number | null;
  wonConversionBuckets: WonConversionBucket[];
  wonDeals: WonDealDetail[];
  avgResponseTime: string;
  totalSalesValue: number;
  pendingCommissions: number;
  leadsTrend: number;
  openTrend: number;
  lostTrend: number;
  conversionTrend: number;
  closedTrend: number;
  totalReceivables: number;
  totalPayables: number;
  overdueReceivables: number;
  overduePayables: number;
  paidCommissions: number;
}

export interface WonConversionBucket {
  key: string;
  label: string;
  count: number;
  percentage: number;
  value: number;
  color: string;
}

export interface WonDealDetail {
  id: string;
  name: string;
  phone: string | null;
  source: string | null;
  value: number;
  createdAt: string | null;
  wonAt: string | null;
  conversionDays: number | null;
  assignedUserName: string;
}

export interface ChartDataPoint {
  name: string;
  meta: number;
  site: number;
}

export interface FunnelDataPoint {
  name: string;
  value: number;
  percentage: number;
  stage_key: string;
}

export interface SourceDataPoint {
  name: string;
  value: number;
  rawSource?: string;
}

export interface TopBroker {
  id: string;
  name: string;
  avatar_url: string | null;
  closedLeads: number;
  salesValue: number;
  totalCommissions: number;
}

export interface TopBrokersResult {
  brokers: TopBroker[];
  isFallbackMode: boolean;
}

function applyLeadMetaOptionFilter(query: any, idColumn: string, nameColumn: string, value?: string | null) {
  if (!value) return query;
  return query.or(`${idColumn}.eq.${value},${nameColumn}.eq.${value}`, { foreignTable: "lead_meta" });
}

export interface UpcomingTask {
  id: string;
  title: string;
  type: "call" | "email" | "meeting" | "message" | "task";
  due_date: string;
  lead_name: string;
  lead_id: string;
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_dashboard_stats");

      if (error) {
        console.error("Error fetching dashboard stats:", error);
        return {
          totalLeads: 0,
          leadsInProgress: 0,
          leadsClosed: 0,
          leadsLost: 0,
          leadsTrend: 0,
          closedTrend: 0,
        } as DashboardStats;
      }

      return data as unknown as DashboardStats;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useEnhancedDashboardStats(filters?: DashboardFilters) {
  const { user, organization } = useAuth();
  const currentUserId = user?.id;
  const organizationId = organization?.id;

  return useQuery({
    queryKey: [
      "enhanced-dashboard-stats",
      currentUserId,
      organizationId,
      filters?.dateRange?.from?.toISOString(),
      filters?.dateRange?.to?.toISOString(),
      filters?.teamId,
      filters?.userId,
      filters?.source,
      filters?.campaignId,
      filters?.adSetId,
      filters?.adId,
      filters?.tagId,
      filters?.dealStatus,
      filters?.searchQuery,
    ],
    enabled: !!currentUserId && !!organizationId,
    queryFn: async (): Promise<EnhancedDashboardStats> => {
      return performanceTracker.trackTimed("useEnhancedDashboardStats", async () => {
        const currentFrom = filters?.dateRange?.from || subDays(new Date(), 30);
        const currentTo = filters?.dateRange?.to || new Date();
        const interval = currentTo.getTime() - currentFrom.getTime();
        const prevFrom = new Date(currentFrom.getTime() - interval);

        const visibility = currentUserId
          ? await checkLeadVisibility(currentUserId)
          : { canViewAll: false, userId: undefined };

        const hasMetaFilter = !!(filters?.campaignId || filters?.adSetId || filters?.adId);
        const hasTagFilter = !!filters?.tagId;
        const teamLeadIds = await fetchDashboardTeamLeadIds(filters?.teamId, null);

        let currentSelect = "id, deal_status, first_response_seconds, valor_interesse";
        if (hasMetaFilter) currentSelect += ", lead_meta!inner(campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name)";
        if (hasTagFilter) currentSelect += ", lead_tags!inner(tag_id)";

        let query = supabase
          .from("leads")
          .select(currentSelect, { count: "exact" })
          .eq("organization_id", organizationId)
          .gte("created_at", currentFrom.toISOString())
          .lte("created_at", currentTo.toISOString());

        query = applyLeadMetaOptionFilter(query, "campaign_id", "campaign_name", filters?.campaignId);
        query = applyLeadMetaOptionFilter(query, "adset_id", "adset_name", filters?.adSetId);
        query = applyLeadMetaOptionFilter(query, "ad_id", "ad_name", filters?.adId);
        if (filters?.tagId) query = query.eq("lead_tags.tag_id", filters.tagId);
        if (filters?.source) query = query.eq("source", filters.source);
        if (filters?.dealStatus) query = query.eq("deal_status", filters.dealStatus);

        if (filters?.searchQuery) {
          const q = `%${filters.searchQuery}%`;
          query = (query as any).or(`name.ilike.${q},email.ilike.${q},phone.ilike.${q}`);
        }

        query = applyVisibilityFilter(query, visibility, "assigned_user_id", filters?.userId);
        query = applyLeadIdFilter(query, teamLeadIds);

        let wonSelect = "id, name, phone, created_at, won_at, valor_interesse, assigned_user_id, source, user:users!leads_assigned_user_id_fkey(id, name, avatar_url)";
        if (hasMetaFilter) wonSelect += ", lead_meta!inner(campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name)";
        if (hasTagFilter) wonSelect += ", lead_tags!inner(tag_id)";

        let wonQuery = supabase
          .from("leads")
          .select(wonSelect)
          .eq("organization_id", organizationId)
          .eq("deal_status", "won")
          .gte("won_at", currentFrom.toISOString())
          .lte("won_at", currentTo.toISOString());

        wonQuery = applyLeadMetaOptionFilter(wonQuery, "campaign_id", "campaign_name", filters?.campaignId);
        wonQuery = applyLeadMetaOptionFilter(wonQuery, "adset_id", "adset_name", filters?.adSetId);
        wonQuery = applyLeadMetaOptionFilter(wonQuery, "ad_id", "ad_name", filters?.adId);
        if (filters?.tagId) wonQuery = wonQuery.eq("lead_tags.tag_id", filters.tagId);
        if (filters?.source) wonQuery = wonQuery.eq("source", filters.source);
        if (filters?.dealStatus) wonQuery = wonQuery.eq("deal_status", filters.dealStatus);

        if (filters?.searchQuery) {
          const q = `%${filters.searchQuery}%`;
          wonQuery = (wonQuery as any).or(`name.ilike.${q},email.ilike.${q},phone.ilike.${q}`);
        }

        wonQuery = applyVisibilityFilter(wonQuery, visibility, "assigned_user_id", filters?.userId);
        wonQuery = applyLeadIdFilter(wonQuery, teamLeadIds);

        let prevSelect = "id, deal_status";
        if (hasMetaFilter) prevSelect += ", lead_meta!inner(campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name)";
        if (hasTagFilter) prevSelect += ", lead_tags!inner(tag_id)";

        let prevQuery = supabase
          .from("leads")
          .select(prevSelect, { count: "exact" })
          .eq("organization_id", organizationId)
          .gte("created_at", prevFrom.toISOString())
          .lt("created_at", currentFrom.toISOString());

        prevQuery = applyLeadMetaOptionFilter(prevQuery, "campaign_id", "campaign_name", filters?.campaignId);
        prevQuery = applyLeadMetaOptionFilter(prevQuery, "adset_id", "adset_name", filters?.adSetId);
        prevQuery = applyLeadMetaOptionFilter(prevQuery, "ad_id", "ad_name", filters?.adId);
        if (filters?.tagId) prevQuery = prevQuery.eq("lead_tags.tag_id", filters.tagId);
        if (filters?.source) prevQuery = prevQuery.eq("source", filters.source);
        if (filters?.dealStatus) prevQuery = prevQuery.eq("deal_status", filters.dealStatus);

        prevQuery = applyVisibilityFilter(prevQuery, visibility, "assigned_user_id", filters?.userId);
        prevQuery = applyLeadIdFilter(prevQuery, teamLeadIds);

        let prevWonQuery = supabase
          .from("leads")
          .select(wonSelect)
          .eq("organization_id", organizationId)
          .eq("deal_status", "won")
          .gte("won_at", prevFrom.toISOString())
          .lt("won_at", currentFrom.toISOString());

        prevWonQuery = applyLeadMetaOptionFilter(prevWonQuery, "campaign_id", "campaign_name", filters?.campaignId);
        prevWonQuery = applyLeadMetaOptionFilter(prevWonQuery, "adset_id", "adset_name", filters?.adSetId);
        prevWonQuery = applyLeadMetaOptionFilter(prevWonQuery, "ad_id", "ad_name", filters?.adId);
        if (filters?.tagId) prevWonQuery = prevWonQuery.eq("lead_tags.tag_id", filters.tagId);
        if (filters?.source) prevWonQuery = prevWonQuery.eq("source", filters.source);
        if (filters?.dealStatus) prevWonQuery = prevWonQuery.eq("deal_status", filters.dealStatus);

        if (filters?.searchQuery) {
          const q = `%${filters.searchQuery}%`;
          prevWonQuery = (prevWonQuery as any).or(`name.ilike.${q},email.ilike.${q},phone.ilike.${q}`);
        }

        prevWonQuery = applyVisibilityFilter(prevWonQuery, visibility, "assigned_user_id", filters?.userId);
        prevWonQuery = applyLeadIdFilter(prevWonQuery, teamLeadIds);

        const [leadsResult, wonResult, prevResult, prevWonResult] = await Promise.all([
          query,
          wonQuery,
          prevQuery,
          prevWonQuery,
        ]);

        const totalLeads = leadsResult.count || 0;
        const leads = leadsResult.data || [];
        const wonLeads = wonResult.data || [];
        const prevTotal = prevResult.count || 0;
        const prevLeads = prevResult.data || [];
        const prevWonLeads = prevWonResult.data || [];

        const respTimes = leads
          .filter((lead: any) => lead.first_response_seconds != null)
          .map((lead: any) => Number(lead.first_response_seconds));

        const avgRespSec = respTimes.length > 0 ? respTimes.reduce((a, b) => a + b, 0) / respTimes.length : null;

        const formatAvgTime = (seconds: number | null) => {
          if (seconds === null) return "--";
          if (seconds < 60) return `${Math.round(seconds)}s`;
          if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
          return `${Math.round(seconds / 3600)}h`;
        };

        const closedLeads = wonLeads.length;
        const lostLeads = leads.filter((lead: any) => lead.deal_status === "lost").length;
        const openLeads = leads.filter((lead: any) => !["won", "lost"].includes(lead.deal_status)).length;
        const totalSalesValue = wonLeads.reduce((sum, lead: any) => sum + (Number(lead.valor_interesse) || 0), 0);
        const wonDeals: WonDealDetail[] = wonLeads.map((lead: any) => {
          const hasDates = lead.created_at && lead.won_at;
          const conversionDays = hasDates
            ? Math.max(0, differenceInDays(new Date(lead.won_at), new Date(lead.created_at)))
            : null;

          return {
            id: lead.id,
            name: lead.name || "Lead sem nome",
            phone: lead.phone || null,
            source: lead.source || null,
            value: Number(lead.valor_interesse) || 0,
            createdAt: lead.created_at || null,
            wonAt: lead.won_at || null,
            conversionDays,
            assignedUserName: lead.user?.name || "Sem responsavel",
          };
        });

        const bucketDefinitions = [
          { key: "up_to_7", label: "Ate 7 dias", min: 0, max: 7, color: "#10b981" },
          { key: "7_to_14", label: "De 7 a 14 dias", min: 8, max: 14, color: "#22c55e" },
          { key: "15_to_30", label: "15 a 30 dias", min: 15, max: 30, color: "#84cc16" },
          { key: "1_to_2_months", label: "Entre 1 e 2 meses", min: 31, max: 60, color: "#eab308" },
          { key: "2_to_4_months", label: "De 2 a 4 meses", min: 61, max: 120, color: "#f97316" },
          { key: "4_to_6_months", label: "De 4 a 6 meses", min: 121, max: 180, color: "#fb6f24" },
          { key: "over_6_months", label: "Acima de 6 meses", min: 181, max: Number.POSITIVE_INFINITY, color: "#ef4444" },
        ];

        const wonConversionBuckets: WonConversionBucket[] = bucketDefinitions.map((bucket) => {
          const deals = wonDeals.filter((deal) => {
            if (deal.conversionDays === null) return false;
            return deal.conversionDays >= bucket.min && deal.conversionDays <= bucket.max;
          });

          return {
            key: bucket.key,
            label: bucket.label,
            count: deals.length,
            percentage: closedLeads > 0 ? (deals.length / closedLeads) * 100 : 0,
            value: deals.reduce((sum, deal) => sum + deal.value, 0),
            color: bucket.color,
          };
        });

        const conversionDays = wonDeals
          .map((deal) => deal.conversionDays)
          .filter((days): days is number => days !== null);
        const wonAverageConversionDays =
          conversionDays.length > 0
            ? Math.round(conversionDays.reduce((sum, days) => sum + days, 0) / conversionDays.length)
            : null;
        const prevLostLeads = prevLeads.filter((lead: any) => lead.deal_status === "lost").length;
        const prevOpenLeads = prevLeads.filter((lead: any) => !["won", "lost"].includes(lead.deal_status)).length;
        const calculateTrend = (current: number, previous: number) =>
          previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0;
        const conversionRate = totalLeads > 0 ? (closedLeads / totalLeads) * 100 : 0;
        const leadsTrend = calculateTrend(totalLeads, prevTotal);

        return {
          totalLeads,
          openLeads,
          lostLeads,
          conversionRate,
          closedLeads,
          wonAverageConversionDays,
          wonConversionBuckets,
          wonDeals,
          avgResponseTime: formatAvgTime(avgRespSec),
          totalSalesValue,
          pendingCommissions: 0,
          leadsTrend,
          openTrend: calculateTrend(openLeads, prevOpenLeads),
          lostTrend: calculateTrend(lostLeads, prevLostLeads),
          conversionTrend: 0,
          closedTrend: calculateTrend(closedLeads, prevWonLeads.length),
          totalReceivables: 0,
          totalPayables: 0,
          overdueReceivables: 0,
          overduePayables: 0,
          paidCommissions: 0,
        };
      });
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useLeadsChartData() {
  const { user } = useAuth();
  const currentUserId = user?.id;

  return useQuery({
    queryKey: ["leads-chart-data", currentUserId],
    enabled: !!currentUserId,
    queryFn: async () => {
      const visibility = currentUserId
        ? await checkLeadVisibility(currentUserId)
        : { canViewAll: false, userId: undefined };

      const sevenDaysAgo = subDays(new Date(), 7).toISOString();

      let query = supabase
        .from("leads")
        .select("created_at, source, assigned_user_id")
        .gte("created_at", sevenDaysAgo)
        .order("created_at");

      query = applyVisibilityFilter(query, visibility);

      const { data: leads } = await query;

      const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
      const chartData: ChartDataPoint[] = [];

      for (let i = 6; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const dayName = days[date.getDay()];
        const dateStr = format(date, "yyyy-MM-dd");

        const dayLeads = (leads || []).filter((lead: any) => lead.created_at?.startsWith(dateStr));

        chartData.push({
          name: dayName,
          meta: dayLeads.filter((lead: any) => lead.source === "meta").length,
          site: dayLeads.filter((lead: any) => lead.source === "site").length,
        });
      }

      return chartData;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useFunnelData(filters?: DashboardFilters, pipelineId?: string | null) {
  const { user, organization } = useAuth();
  const organizationId = organization?.id;

  return useQuery({
    queryKey: [
      "funnel-data",
      organizationId,
      filters?.dateRange?.from?.toISOString(),
      filters?.dateRange?.to?.toISOString(),
      filters?.teamId,
      filters?.userId,
      filters?.source,
      filters?.campaignId,
      filters?.adSetId,
      filters?.adId,
      filters?.tagId,
      filters?.dealStatus,
      filters?.searchQuery,
      pipelineId,
      user?.id,
    ],
    enabled: !!user?.id && !!organizationId,
    queryFn: async () => {
      const visibility = user?.id ? await checkLeadVisibility(user.id) : { canViewAll: false, userId: undefined };
      const hasMetaFilter = !!(filters?.campaignId || filters?.adSetId || filters?.adId);
      const hasClientOnlyFilter = hasMetaFilter || !!filters?.searchQuery;

      let effectiveUserId = filters?.userId;
      if (!effectiveUserId && !visibility.canViewAll) {
        effectiveUserId = visibility.teamMemberIds ? null : visibility.userId;
      }

      if (hasClientOnlyFilter) {
        let effectivePipelineId = pipelineId || null;
        if (!effectivePipelineId) {
          const { data: pipeline } = await supabase
            .from("pipelines")
            .select("id")
            .eq("organization_id", organizationId)
            .order("is_default", { ascending: false })
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          effectivePipelineId = pipeline?.id || null;
        }

        if (!effectivePipelineId) return [] as FunnelDataPoint[];

        const { data: stages, error: stagesError } = await supabase
          .from("stages")
          .select("id, name, stage_key, position")
          .eq("pipeline_id", effectivePipelineId)
          .order("position");

        if (stagesError) throw stagesError;

        const stageIds = (stages || []).map((stage) => stage.id);
        if (stageIds.length === 0) return [] as FunnelDataPoint[];

        let selectString = "id, stage_id, assigned_user_id, source, deal_status";
        if (hasMetaFilter) selectString += ", lead_meta!inner(campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name)";
        if (filters?.tagId) selectString += ", lead_tags!inner(tag_id)";

        let query = (supabase as any)
          .from("leads")
          .select(selectString)
          .eq("organization_id", organizationId)
          .in("stage_id", stageIds);

        if (filters?.dateRange?.from) query = query.gte("created_at", filters.dateRange.from.toISOString());
        if (filters?.dateRange?.to) query = query.lte("created_at", filters.dateRange.to.toISOString());
        if (filters?.source) query = query.eq("source", filters.source);
        if (filters?.dealStatus) query = query.eq("deal_status", filters.dealStatus);
        if (filters?.tagId) query = query.eq("lead_tags.tag_id", filters.tagId);
        query = applyLeadMetaOptionFilter(query, "campaign_id", "campaign_name", filters?.campaignId);
        query = applyLeadMetaOptionFilter(query, "adset_id", "adset_name", filters?.adSetId);
        query = applyLeadMetaOptionFilter(query, "ad_id", "ad_name", filters?.adId);
        if (filters?.searchQuery) {
          const q = `%${filters.searchQuery}%`;
          query = query.or(`name.ilike.${q},email.ilike.${q},phone.ilike.${q}`);
        }

        query = applyVisibilityFilter(query, visibility, "assigned_user_id", effectiveUserId);
        const teamLeadIds = await fetchDashboardTeamLeadIds(filters?.teamId, filters?.dateRange);
        query = applyLeadIdFilter(query, teamLeadIds);

        const { data: leads, error } = await query;
        if (error) {
          console.error("Error fetching filtered funnel data:", error);
          return [] as FunnelDataPoint[];
        }

        const counts = (leads || []).reduce((acc: Record<string, number>, lead: any) => {
          acc[lead.stage_id] = (acc[lead.stage_id] || 0) + 1;
          return acc;
        }, {});

        const result = (stages || []).map((stage: any) => ({
          name: stage.name,
          value: counts[stage.id] || 0,
          percentage: 0,
          stage_key: stage.stage_key || stage.name,
        }));

        const total = result.reduce((sum: number, item: FunnelDataPoint) => sum + item.value, 0);
        return result.map((item: FunnelDataPoint) => ({
          ...item,
          percentage: total > 0 ? Math.round((item.value / total) * 100) : 0,
        })) as FunnelDataPoint[];
      }

      const { data, error } = await (supabase as any).rpc("get_funnel_data", {
        p_date_from: filters?.dateRange?.from?.toISOString() || null,
        p_date_to: filters?.dateRange?.to?.toISOString() || null,
        p_team_id: filters?.teamId || null,
        p_user_id: effectiveUserId || null,
        p_source: filters?.source || null,
          p_pipeline_id: pipelineId || null,
          p_tag_id: filters?.tagId || null,
          p_deal_status: filters?.dealStatus || null,
      });

      if (error) {
        console.error("Error fetching funnel data:", error);
        return [] as FunnelDataPoint[];
      }

      const result = (data || []).map((item: any) => ({
        name: item.stage_name,
        value: Number(item.lead_count) || 0,
        percentage: 0,
        stage_key: item.stage_key || item.stage_name,
      }));

      const total = result.reduce((sum: number, item: FunnelDataPoint) => sum + item.value, 0);

      return result.map((item: FunnelDataPoint) => ({
        ...item,
        percentage: total > 0 ? Math.round((item.value / total) * 100) : 0,
      })) as FunnelDataPoint[];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useLeadSourcesData(filters?: DashboardFilters, pipelineId?: string | null) {
  const { user, organization } = useAuth();
  const organizationId = organization?.id;

  return useQuery({
    queryKey: [
      "lead-sources-data",
      organizationId,
      filters?.dateRange?.from?.toISOString(),
      filters?.dateRange?.to?.toISOString(),
      filters?.teamId,
      filters?.userId,
      filters?.source,
      filters?.campaignId,
      filters?.adSetId,
      filters?.adId,
      filters?.tagId,
      filters?.dealStatus,
      filters?.searchQuery,
      pipelineId,
      user?.id,
    ],
    enabled: !!user?.id && !!organizationId,
    queryFn: async () => {
      const visibility = user?.id ? await checkLeadVisibility(user.id) : { canViewAll: false, userId: undefined };
      const hasMetaFilter = !!(filters?.campaignId || filters?.adSetId || filters?.adId);
      const hasClientOnlyFilter = hasMetaFilter || !!filters?.searchQuery;

      let effectiveUserId = filters?.userId;
      if (!effectiveUserId && !visibility.canViewAll) {
        effectiveUserId = visibility.teamMemberIds ? null : visibility.userId;
      }

      if (hasClientOnlyFilter) {
        let stageIds: string[] | null = null;
        if (pipelineId) {
          const { data: stages, error: stagesError } = await supabase
            .from("stages")
            .select("id")
            .eq("pipeline_id", pipelineId);
          if (stagesError) throw stagesError;
          stageIds = (stages || []).map((stage) => stage.id);
          if (stageIds.length === 0) return [] as SourceDataPoint[];
        }

        let selectString = "id, assigned_user_id, source";
        if (hasMetaFilter) selectString += ", lead_meta!inner(campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name)";
        if (filters?.tagId) selectString += ", lead_tags!inner(tag_id)";

        let query = (supabase as any)
          .from("leads")
          .select(selectString)
          .eq("organization_id", organizationId);

        if (stageIds) query = query.in("stage_id", stageIds);
        if (filters?.dateRange?.from) query = query.gte("created_at", filters.dateRange.from.toISOString());
        if (filters?.dateRange?.to) query = query.lte("created_at", filters.dateRange.to.toISOString());
        if (filters?.source) query = query.eq("source", filters.source);
        if (filters?.dealStatus) query = query.eq("deal_status", filters.dealStatus);
        if (filters?.tagId) query = query.eq("lead_tags.tag_id", filters.tagId);
        query = applyLeadMetaOptionFilter(query, "campaign_id", "campaign_name", filters?.campaignId);
        query = applyLeadMetaOptionFilter(query, "adset_id", "adset_name", filters?.adSetId);
        query = applyLeadMetaOptionFilter(query, "ad_id", "ad_name", filters?.adId);
        if (filters?.searchQuery) {
          const q = `%${filters.searchQuery}%`;
          query = query.or(`name.ilike.${q},email.ilike.${q},phone.ilike.${q}`);
        }

        query = applyVisibilityFilter(query, visibility, "assigned_user_id", effectiveUserId);
        const teamLeadIds = await fetchDashboardTeamLeadIds(filters?.teamId, filters?.dateRange);
        query = applyLeadIdFilter(query, teamLeadIds);

        const { data: leads, error } = await query;
        if (error) {
          console.error("Error fetching filtered lead sources:", error);
          return [] as SourceDataPoint[];
        }

        const aggregatedData: Record<string, { count: number; rawSource: string }> = {};
        (leads || []).forEach((lead: any) => {
          const rawSource = lead.source || "manual";
          const label = sourceLabels[rawSource] || rawSource || "Outros";

          if (!aggregatedData[label]) aggregatedData[label] = { count: 0, rawSource };
          aggregatedData[label].count += 1;
        });

        return Object.entries(aggregatedData)
          .map(([name, data]) => ({
            name,
            value: data.count,
            rawSource: data.rawSource,
          }))
          .sort((a, b) => b.value - a.value) as SourceDataPoint[];
      }

      const { data, error } = await (supabase as any).rpc("get_lead_sources_data", {
        p_date_from: filters?.dateRange?.from?.toISOString() || null,
        p_date_to: filters?.dateRange?.to?.toISOString() || null,
        p_team_id: filters?.teamId || null,
        p_user_id: effectiveUserId || null,
        p_source: filters?.source || null,
          p_pipeline_id: pipelineId || null,
          p_tag_id: filters?.tagId || null,
          p_deal_status: filters?.dealStatus || null,
      });

      if (error) {
        console.error("Error fetching lead sources:", error);
        return [] as SourceDataPoint[];
      }

      const aggregatedData: Record<string, { count: number; rawSource: string }> = {};

      (data || []).forEach((item: any) => {
        const rawSource = item.source_name;
        const label = sourceLabels[rawSource] || rawSource || "Outros";

        if (!aggregatedData[label]) {
          aggregatedData[label] = { count: 0, rawSource };
        }

        aggregatedData[label].count += Number(item.lead_count) || 0;
      });

      return Object.entries(aggregatedData)
        .map(([name, data]) => ({
          name,
          value: data.count,
          rawSource: data.rawSource,
        }))
        .sort((a, b) => b.value - a.value) as SourceDataPoint[];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useTopBrokers(filters?: DashboardFilters) {
  const { user, organization } = useAuth();
  const currentUserId = user?.id;
  const organizationId = organization?.id;

  return useQuery({
    queryKey: [
      "top-brokers",
      currentUserId,
      organizationId,
      filters?.dateRange?.from?.toISOString(),
      filters?.dateRange?.to?.toISOString(),
      filters?.teamId,
      filters?.userId,
      filters?.source,
      filters?.campaignId,
      filters?.adSetId,
      filters?.adId,
    ],
    enabled: !!currentUserId && !!organizationId,
    queryFn: async (): Promise<TopBrokersResult> => {
      const visibility = currentUserId
        ? await checkLeadVisibility(currentUserId)
        : { canViewAll: false, userId: undefined };

      if (!visibility.canViewAll && !visibility.teamMemberIds) {
        return { brokers: [], isFallbackMode: false };
      }
      const teamLeadIds = await fetchDashboardTeamLeadIds(filters?.teamId, null);

      let selectString = `
          assigned_user_id,
          valor_interesse,
          deal_status,
          user:users!leads_assigned_user_id_fkey(id, name, avatar_url)
        `;

      if (filters?.campaignId || filters?.adSetId || filters?.adId) {
        selectString += ", lead_meta!inner(campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name)";
      }

      let query = supabase
        .from("leads")
        .select(selectString)
        .eq("organization_id", organizationId)
        .not("assigned_user_id", "is", null)
        .eq("deal_status", "won");

      query = applyLeadMetaOptionFilter(query, "campaign_id", "campaign_name", filters?.campaignId);
      query = applyLeadMetaOptionFilter(query, "adset_id", "adset_name", filters?.adSetId);
      query = applyLeadMetaOptionFilter(query, "ad_id", "ad_name", filters?.adId);

      if (visibility.teamMemberIds) {
        query = query.in("assigned_user_id", visibility.teamMemberIds);
      }
      query = applyLeadIdFilter(query, teamLeadIds);

      if (filters?.dateRange) {
        query = query
          .gte("won_at", filters.dateRange.from.toISOString())
          .lte("won_at", filters.dateRange.to.toISOString());
      }

      if (filters?.userId) query = query.eq("assigned_user_id", filters.userId);
      if (filters?.source) query = query.eq("source", filters.source);

      const { data: wonLeads, error } = await query;

      if (error) {
        console.error("Error fetching top brokers:", error);
        return { brokers: [], isFallbackMode: false };
      }

      if (wonLeads && wonLeads.length > 0) {
        const userIds = [...new Set(wonLeads.map((lead: any) => lead.assigned_user_id).filter(Boolean))];

        const { data: commissions } = await supabase
          .from("commissions")
          .select("user_id, amount, status")
          .in("user_id", userIds);

        const commissionTotals: Record<string, number> = {};

        (commissions || []).forEach((commission: any) => {
          if (["forecast", "approved", "paid"].includes(commission.status)) {
            commissionTotals[commission.user_id] =
              (commissionTotals[commission.user_id] || 0) + (commission.amount || 0);
          }
        });

        const brokerStats = wonLeads.reduce((acc: Record<string, TopBroker>, lead: any) => {
          const userId = lead.assigned_user_id;
          if (!userId || !lead.user) return acc;

          if (!acc[userId]) {
            acc[userId] = {
              id: userId,
              name: lead.user.name || "Usuário",
              avatar_url: lead.user.avatar_url,
              closedLeads: 0,
              salesValue: 0,
              totalCommissions: commissionTotals[userId] || 0,
            };
          }

          acc[userId].closedLeads += 1;
          acc[userId].salesValue += lead.valor_interesse || 0;

          return acc;
        }, {});

        return {
          brokers: Object.values(brokerStats)
            .sort((a, b) => b.closedLeads - a.closedLeads)
            .slice(0, 5),
          isFallbackMode: false,
        };
      }

      let fallbackSelectString = `
          assigned_user_id,
          valor_interesse,
          user:users!leads_assigned_user_id_fkey(id, name, avatar_url)
        `;

      if (filters?.campaignId || filters?.adSetId || filters?.adId) {
        fallbackSelectString += ", lead_meta!inner(campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name)";
      }

      let fallbackQuery = supabase.from("leads").select(fallbackSelectString).not("assigned_user_id", "is", null);
      fallbackQuery = applyLeadIdFilter(fallbackQuery, teamLeadIds);

      fallbackQuery = applyLeadMetaOptionFilter(fallbackQuery, "campaign_id", "campaign_name", filters?.campaignId);
      fallbackQuery = applyLeadMetaOptionFilter(fallbackQuery, "adset_id", "adset_name", filters?.adSetId);
      fallbackQuery = applyLeadMetaOptionFilter(fallbackQuery, "ad_id", "ad_name", filters?.adId);

      if (filters?.dateRange) {
        fallbackQuery = fallbackQuery
          .gte("created_at", filters.dateRange.from.toISOString())
          .lte("created_at", filters.dateRange.to.toISOString());
      }

      if (filters?.userId) fallbackQuery = fallbackQuery.eq("assigned_user_id", filters.userId);
      if (filters?.source) fallbackQuery = fallbackQuery.eq("source", filters.source);

      const { data: allLeads, error: fallbackError } = await fallbackQuery;

      if (fallbackError || !allLeads || allLeads.length === 0) {
        return { brokers: [], isFallbackMode: true };
      }

      const brokerStats = allLeads.reduce((acc: Record<string, TopBroker>, lead: any) => {
        const userId = lead.assigned_user_id;
        if (!userId || !lead.user) return acc;

        if (!acc[userId]) {
          acc[userId] = {
            id: userId,
            name: lead.user.name || "Usuário",
            avatar_url: lead.user.avatar_url,
            closedLeads: 0,
            salesValue: 0,
            totalCommissions: 0,
          };
        }

        acc[userId].closedLeads += 1;
        acc[userId].salesValue += lead.valor_interesse || 0;

        return acc;
      }, {});

      return {
        brokers: Object.values(brokerStats)
          .sort((a, b) => b.closedLeads - a.closedLeads)
          .slice(0, 5),
        isFallbackMode: true,
      };
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpcomingTasks() {
  const { user } = useAuth();
  const currentUserId = user?.id;

  return useQuery({
    queryKey: ["upcoming-tasks", currentUserId],
    enabled: !!currentUserId,
    queryFn: async (): Promise<UpcomingTask[]> => {
      const visibility = currentUserId
        ? await checkLeadVisibility(currentUserId)
        : { canViewAll: false, userId: undefined };

      let leadIds: string[] = [];

      if (!visibility.canViewAll) {
        const userIdsToFilter = visibility.teamMemberIds || (visibility.userId ? [visibility.userId] : []);

        if (userIdsToFilter.length > 0) {
          const { data: userLeads } = await supabase.from("leads").select("id").in("assigned_user_id", userIdsToFilter);

          leadIds = (userLeads || []).map((lead: any) => lead.id);

          if (leadIds.length === 0) {
            return [];
          }
        }
      }

      let query = supabase
        .from("lead_tasks")
        .select(
          `
          id,
          title,
          type,
          due_date,
          lead_id,
          lead:leads(id, name)
        `,
        )
        .eq("is_done", false)
        .not("due_date", "is", null)
        .order("due_date", { ascending: true })
        .limit(10);

      if (!visibility.canViewAll && leadIds.length > 0) {
        query = query.in("lead_id", leadIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching upcoming tasks:", error);
        return [];
      }

      return (data || []).slice(0, 5).map((task: any) => ({
        id: task.id,
        title: task.title,
        type: task.type || "task",
        due_date: task.due_date,
        lead_name: task.lead?.name || "Lead",
        lead_id: task.lead?.id || "",
      }));
    },
    staleTime: 1000 * 60 * 2,
  });
}

export function useDealsEvolutionData(filters?: DashboardFilters) {
  const { user, organization } = useAuth();
  const currentUserId = user?.id;
  const organizationId = organization?.id;

  return useQuery({
    queryKey: [
      "deals-evolution",
      currentUserId,
      organizationId,
      filters?.dateRange?.from?.toISOString(),
      filters?.dateRange?.to?.toISOString(),
      filters?.teamId,
      filters?.userId,
      filters?.source,
      filters?.campaignId,
      filters?.adSetId,
      filters?.adId,
      filters?.tagId,
      filters?.dealStatus,
      filters?.searchQuery,
    ],
    enabled: !!currentUserId && !!organizationId,
    queryFn: async (): Promise<DealsEvolutionPoint[]> => {
      return performanceTracker.trackTimed("useDealsEvolutionData", async () => {
        const visibility = currentUserId
          ? await checkLeadVisibility(currentUserId)
          : { canViewAll: false, userId: undefined };
        const teamLeadIds = await fetchDashboardTeamLeadIds(filters?.teamId, null);

        const now = new Date();
        const dateFrom = filters?.dateRange?.from || subDays(now, 30);
        const dateTo = filters?.dateRange?.to || now;
        const daysDiff = differenceInDays(dateTo, dateFrom);
        const isSingleDayRange = isSameDay(dateFrom, dateTo);

        let selectString = "id, created_at, won_at, lost_at, deal_status, assigned_user_id, source";
        if (filters?.campaignId || filters?.adSetId || filters?.adId) {
          selectString += ", lead_meta!inner(campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name)";
        }
        if (filters?.tagId) {
          selectString += ", lead_tags!inner(tag_id)";
        }

        let query = supabase
          .from("leads")
          .select(selectString)
          .eq("organization_id", organizationId)
          .or(
            `and(created_at.gte.${dateFrom.toISOString()},created_at.lte.${dateTo.toISOString()}),` +
              `and(won_at.gte.${dateFrom.toISOString()},won_at.lte.${dateTo.toISOString()})`,
          );

        query = applyLeadMetaOptionFilter(query, "campaign_id", "campaign_name", filters?.campaignId);
        query = applyLeadMetaOptionFilter(query, "adset_id", "adset_name", filters?.adSetId);
        query = applyLeadMetaOptionFilter(query, "ad_id", "ad_name", filters?.adId);
        if (filters?.tagId) query = query.eq("lead_tags.tag_id", filters.tagId);

        query = applyVisibilityFilter(query, visibility, "assigned_user_id", filters?.userId);
        query = applyLeadIdFilter(query, teamLeadIds);

        if (filters?.source) {
          query = query.eq("source", filters.source as any);
        }

        if (filters?.dealStatus) {
          query = query.eq("deal_status", filters.dealStatus as any);
        }

        if (filters?.searchQuery) {
          const q = `%${filters.searchQuery}%`;
          query = (query as any).or(`name.ilike.${q},email.ilike.${q},phone.ilike.${q}`);
        }

        const { data: leads, error } = await query;

        if (error) {
          console.error("Error fetching deals evolution:", error);
          return [];
        }

        if (!leads || leads.length === 0) {
          return [];
        }

        let intervals: Date[];
        let formatLabel: (date: Date) => string;
        let shouldLimitPoints = true;
        let singleDayEnd: Date | null = null;

        if (isSingleDayRange) {
          const singleDayStart = startOfDay(dateFrom);
          singleDayEnd = addDays(singleDayStart, 1);
          intervals = Array.from({ length: 24 }, (_, hour) => addHours(singleDayStart, hour));
          formatLabel = (date) => format(date, "HH:mm", { locale: ptBR });
          shouldLimitPoints = false;
        } else if (daysDiff <= 31) {
          intervals = eachDayOfInterval({ start: dateFrom, end: dateTo });
          formatLabel = (date) => format(date, "dd/MM", { locale: ptBR });
          shouldLimitPoints = false;
        } else if (daysDiff <= 90) {
          intervals = eachWeekOfInterval({ start: dateFrom, end: dateTo }, { weekStartsOn: 1 });
          formatLabel = (date) => format(date, "'Sem' w", { locale: ptBR });
        } else {
          intervals = eachMonthOfInterval({ start: dateFrom, end: dateTo });
          formatLabel = (date) => format(date, "MMM", { locale: ptBR });
        }

        if (shouldLimitPoints && intervals.length > 12) {
          const step = Math.ceil(intervals.length / 12);
          intervals = intervals.filter((_, index) => index % step === 0);
        }

        const inRange = (iso: string | null, start: Date, end: Date) => {
          if (!iso) return false;
          const date = new Date(iso);
          return date >= start && date < end;
        };

        const result: DealsEvolutionPoint[] = intervals.map((intervalStart, index) => {
          const intervalEnd =
            isSingleDayRange && index === intervals.length - 1 && singleDayEnd
              ? singleDayEnd
              : index < intervals.length - 1
                ? intervals[index + 1]
                : dateTo;

          const ganhos = leads.filter(
            (lead: any) => lead.deal_status === "won" && inRange(lead.won_at, intervalStart, intervalEnd),
          ).length;

          const perdas = leads.filter(
            (lead: any) => lead.deal_status === "lost" && inRange(lead.created_at, intervalStart, intervalEnd),
          ).length;

          const abertos = leads.filter(
            (lead: any) =>
              (lead.deal_status === "open" || !lead.deal_status) &&
              inRange(lead.created_at, intervalStart, intervalEnd),
          ).length;

          return {
            date: formatLabel(intervalStart),
            ganhos,
            perdas,
            abertos,
          };
        });

        return result;
      });
    },
    staleTime: 1000 * 60 * 5,
  });
}
