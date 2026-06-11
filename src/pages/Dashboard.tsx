import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Users,
  DollarSign,
  Building2,
  Clock,
  Eye,
  TrendingUp,
  TrendingDown,
  CalendarCheck,
  CircleDot,
  XCircle,
  Trophy,
} from "lucide-react";

import { performanceTracker } from "@/lib/performance";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// Componentes de Layout e UI
import { AppLayout } from "@/components/layout/AppLayout";

import { KPICards } from "@/components/dashboard/KPICards";
import { SalesFunnelWithPipeline } from "@/components/dashboard/SalesFunnelWithPipeline";
import { DealsEvolutionChart } from "@/components/dashboard/DealsEvolutionChart";
import { LeadSourcesChart } from "@/components/dashboard/LeadSourcesChart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

// Hooks e Contextos
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useEnhancedDashboardStats, useDealsEvolutionData, useLeadSourcesData } from "@/hooks/use-dashboard-stats";
import { useAuth } from "@/contexts/AuthContext";
import { useLeadVisibility, applyVisibilityFilter } from "@/hooks/use-lead-visibility";
import { useIsMobile } from "@/hooks/use-mobile";
import { SharedFilters } from "@/components/shared/SharedFilters";
import { datePresetOptions, sourceLabels } from "@/hooks/use-dashboard-filters";

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================
export default function Dashboard() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [mobileChartTab, setMobileChartTab] = useState("funnel");
  const [wonDialogOpen, setWonDialogOpen] = useState(false);
  const { organization, user } = useAuth();
  const { data: visibility } = useLeadVisibility(user?.id);

  const {
    filters,
    datePreset,
    setDatePreset,
    customDateRange,
    setCustomDateRange,
    teamId,
    setTeamId,
    userId,
    setUserId,
    source,
    setSource,
    campaignId,
    setCampaignId,
    adSetId,
    setAdSetId,
    adId,
    setAdId,
    tagId,
    setTagId,
    dealStatus,
    setDealStatus,
    searchQuery,
    setSearchQuery,
    clearFilters,
    hasActiveFilters,
    dynamicSources,
    campaigns,
    adSets,
    ads,
    tags,
    isLoadingSources,
    isLoadingCampaigns,
    isLoadingAdSets,
    isLoadingAds,
  } = useSharedFilters();

  // Mapeamento de strings de data para chaves de cache estáveis
  const dateFromStr = filters.dateRange.from.toISOString();
  const dateToStr = filters.dateRange.to.toISOString();

  const getDashboardPropertyUserIds = async () => {
    if (filters.userId) return [filters.userId];

    if (filters.teamId) {
      const { data: members, error } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", filters.teamId);

      if (error) throw error;

      return (members || []).map((member) => member.user_id).filter(Boolean);
    }

    if (!visibility || visibility.canViewAll) return null;
    if (visibility.teamMemberIds?.length) return visibility.teamMemberIds;
    return visibility.userId ? [visibility.userId] : [];
  };

  const getDashboardTeamMemberIds = async () => {
    if (!filters.teamId) return null;

    const { data: members, error } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", filters.teamId);

    if (error) throw error;
    return (members || []).map((member) => member.user_id).filter(Boolean);
  };

  const applyPropertyUserFilter = (query: any, propertyUserIds: string[]) => {
    const ids = propertyUserIds.join(",");
    return query.or(`corretor_id.in.(${ids}),cadastrado_por.in.(${ids})`);
  };

  const getDashboardPropertyIds = async (organizationId: string, propertyUserIds: string[]) => {
    const { data, error } = await applyPropertyUserFilter(
      supabase
        .from("properties")
        .select("id")
        .eq("organization_id", organizationId),
      propertyUserIds,
    );

    if (error) throw error;
    return (data || []).map((property) => property.id).filter(Boolean);
  };

  // Query: Contagem de Imóveis
  const { data: propertyCount = 0 } = useQuery({
    queryKey: ["dashboard-property-count", organization?.id, dateFromStr, dateToStr, filters.userId, filters.teamId, visibility],
    queryFn: async () => {
      if (!organization?.id || !visibility) return 0;
      const propertyUserIds = await getDashboardPropertyUserIds();
      let query = supabase
        .from("properties")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .gte("created_at", dateFromStr)
        .lte("created_at", dateToStr);

      if (propertyUserIds) {
        if (propertyUserIds.length === 0) return 0;
        query = applyPropertyUserFilter(query, propertyUserIds);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: !!organization?.id && !!visibility,
    staleTime: 1000 * 60 * 5,
  });

  // Data hooks - Imobiliário
  const { data: stats, isLoading: statsLoading } = useEnhancedDashboardStats(filters);
  const { data: evolutionData = [], isLoading: evolutionLoading } = useDealsEvolutionData(filters);
  const { data: sourcesData = [], isLoading: sourcesLoading } = useLeadSourcesData(filters);

  // Query: Visitas no Site
  const { data: siteVisits = 0 } = useQuery({
    queryKey: ["dashboard-site-visits", organization?.id, dateFromStr, dateToStr, filters.userId, filters.teamId, visibility],
    queryFn: async () => {
      if (!organization?.id || !visibility) return 0;
      const propertyUserIds = await getDashboardPropertyUserIds();

      if (propertyUserIds) {
        if (propertyUserIds.length === 0) return 0;

        const propertyIds = await getDashboardPropertyIds(organization.id, propertyUserIds);

        if (propertyIds.length === 0) return 0;

        const { data: events, error } = await supabase
          .from("lead_events")
          .select("session_id")
          .eq("organization_id", organization.id)
          .in("property_id", propertyIds)
          .gte("created_at", dateFromStr)
          .lte("created_at", dateToStr);

        if (error) throw error;
        return new Set((events || []).map((event) => event.session_id).filter(Boolean)).size;
      }

      const { data, error } = await (supabase as any).rpc("count_unique_sessions", {
        p_organization_id: organization.id,
        p_date_from: dateFromStr,
        p_date_to: dateToStr,
      });
      if (error) throw error;
      return Number(data) || 0;
    },
    enabled: !!organization?.id && !!visibility,
    staleTime: 1000 * 60 * 5,
  });

  // Query: Visitas Agendadas
  const { data: scheduledVisitsCount = 0 } = useQuery({
    queryKey: [
      "dashboard-scheduled-visits",
      organization?.id,
      dateFromStr,
      dateToStr,
      filters.userId,
      filters.teamId,
      filters.source,
      filters.campaignId,
      filters.adSetId,
      filters.adId,
      filters.tagId,
      filters.dealStatus,
      filters.searchQuery,
      visibility,
    ],
    queryFn: async () => {
      if (!organization?.id || !visibility) return 0;

      // Se há filtros que dependem de lead (source, campanha, tag, status, team),
      // precisamos buscar os lead_ids correspondentes primeiro
      let leadIds: string[] | null = null;
      const needsLeadFilter =
        filters.source ||
        filters.campaignId ||
        filters.adSetId ||
        filters.adId ||
        filters.tagId ||
        filters.dealStatus ||
        filters.searchQuery;

      if (needsLeadFilter) {
        const hasMetaFilter = !!(filters.campaignId || filters.adSetId || filters.adId);
        const hasTagFilter = !!filters.tagId;
        let selectString = "id, name, email, phone";
        if (hasMetaFilter) selectString += ", lead_meta!inner(campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name)";
        if (hasTagFilter) selectString += ", lead_tags!inner(tag_id)";

        let leadQuery = supabase.from("leads").select(selectString).eq("organization_id", organization.id);

        if (filters.source) leadQuery = leadQuery.eq("source", filters.source);
        if (filters.dealStatus) leadQuery = leadQuery.eq("deal_status", filters.dealStatus);
        if (filters.campaignId) {
          leadQuery = (leadQuery as any).or(`campaign_id.eq.${filters.campaignId},campaign_name.eq.${filters.campaignId}`, {
            foreignTable: "lead_meta",
          });
        }
        if (filters.adSetId) {
          leadQuery = (leadQuery as any).or(`adset_id.eq.${filters.adSetId},adset_name.eq.${filters.adSetId}`, {
            foreignTable: "lead_meta",
          });
        }
        if (filters.adId) {
          leadQuery = (leadQuery as any).or(`ad_id.eq.${filters.adId},ad_name.eq.${filters.adId}`, {
            foreignTable: "lead_meta",
          });
        }
        if (filters.searchQuery) {
          const q = `%${filters.searchQuery}%`;
          leadQuery = (leadQuery as any).or(`name.ilike.${q},email.ilike.${q},phone.ilike.${q}`);
        }

        if (filters.teamId) {
          const teamMemberIds = await getDashboardTeamMemberIds();
          if (!teamMemberIds || teamMemberIds.length === 0) return 0;
          leadQuery = leadQuery.in("assigned_user_id", teamMemberIds);
        }

        if (filters.tagId) {
          leadQuery = leadQuery.eq("lead_tags.tag_id", filters.tagId);
        }

        const { data: leads, error: leadsError } = await leadQuery;
        if (leadsError) throw leadsError;

        leadIds = (leads || []).map((l) => l.id);
        if (leadIds.length === 0) return 0;
      }

      let query = supabase
        .from("schedule_events")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .eq("event_type", "visit")
        .gte("start_time", dateFromStr)
        .lte("start_time", dateToStr);

      if (leadIds !== null) {
        query = query.in("lead_id", leadIds);
      }

      query = applyVisibilityFilter(query, visibility, "user_id", filters.userId);

      if (filters.teamId) {
        const teamMemberIds = await getDashboardTeamMemberIds();
        if (!teamMemberIds || teamMemberIds.length === 0) return 0;
        query = query.in("user_id", teamMemberIds);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: !!organization?.id && !!visibility,
    staleTime: 1000 * 60,
  });

  useEffect(() => {
    if (!statsLoading && !evolutionLoading) {
      performanceTracker.addMetric("Dashboard Full Load", performance.now(), "ms");
    }
  }, [statsLoading, evolutionLoading]);

  const funnelComponent = <SalesFunnelWithPipeline filters={filters} />;
  const periodLabel = datePresetOptions.find((o) => o.value === datePreset)?.label || "Período selecionado";

  const kpiData = stats || {
    totalLeads: 0,
    openLeads: 0,
    lostLeads: 0,
    conversionRate: 0,
    closedLeads: 0,
    wonAverageConversionDays: null,
    wonConversionBuckets: [],
    wonDeals: [],
    avgResponseTime: "--",
    totalSalesValue: 0,
    pendingCommissions: 0,
    leadsTrend: 0,
    openTrend: 0,
    lostTrend: 0,
    conversionTrend: 0,
    closedTrend: 0,
    totalReceivables: 0,
    totalPayables: 0,
    overdueReceivables: 0,
    overduePayables: 0,
    paidCommissions: 0,
  };

  return (
    <AppLayout title="Dashboard" disableMainScroll={true}>
      <div
        className={cn(
          "flex flex-col gap-2 md:gap-3 animate-fade-in h-full w-full",
          !isMobile ? "flex-1 min-h-0 overflow-hidden" : "",
        )}
      >
        <div data-tour="dashboard-filters">
          <SharedFilters
            datePreset={datePreset}
            onDatePresetChange={setDatePreset}
            customDateRange={customDateRange}
            onCustomDateRangeChange={setCustomDateRange}
            teamId={teamId}
            onTeamChange={setTeamId}
            userId={userId}
            onUserChange={setUserId}
            source={source}
            onSourceChange={setSource}
            campaignId={campaignId}
            onCampaignChange={setCampaignId}
            adSetId={adSetId}
            onAdSetChange={setAdSetId}
            adId={adId}
            onAdChange={setAdId}
            tagId={tagId}
            onTagChange={setTagId}
            dealStatus={dealStatus}
            onDealStatusChange={setDealStatus}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onClear={clearFilters}
            hasActiveFilters={hasActiveFilters}
            hideSearch
            dynamicSources={dynamicSources}
            campaigns={campaigns}
            adSets={adSets}
            ads={ads}
            tags={tags}
            isLoadingSources={isLoadingSources}
            isLoadingCampaigns={isLoadingCampaigns}
            isLoadingAdSets={isLoadingAdSets}
            isLoadingAds={isLoadingAds}
          />
        </div>

        {/* ===== DESKTOP LAYOUT ===== */}
        <div className="hidden lg:grid lg:grid-cols-12 gap-2 md:gap-3 flex-1 min-h-0 overflow-hidden">
          <div className="col-span-8 flex flex-col gap-3 min-h-0">
            <div className="flex-shrink-0">
              <KPICardsGrid
                data={kpiData}
                isLoading={statsLoading}
                periodLabel={periodLabel}
                propertyCount={propertyCount}
                siteVisits={siteVisits}
                scheduledVisits={scheduledVisitsCount}
                layout="top"
                onWonClick={() => setWonDialogOpen(true)}
              />
            </div>

            <div data-tour="dashboard-evolution" className="flex-1 min-h-0">
              <DealsEvolutionChart data={evolutionData} isLoading={evolutionLoading} />
            </div>
          </div>

          <div className="col-span-4 min-h-0 flex flex-col gap-3">
            <div data-tour="dashboard-funnel" className="h-[48%] min-h-0">{funnelComponent}</div>
            <div data-tour="dashboard-sources" className="h-[52%] min-h-0">
              <LeadSourcesChart
                data={sourcesData}
                isLoading={sourcesLoading}
                selectedSource={source}
                onSourceChange={setSource}
              />
            </div>
          </div>
        </div>

        {/* ===== MOBILE LAYOUT ===== */}
        <div className={cn("lg:hidden flex flex-col gap-4 overflow-y-auto", !isMobile ? "flex-1 min-h-0" : "")}>
          <KPICards
            data={kpiData}
            isLoading={statsLoading}
            periodLabel={periodLabel}
            scheduledVisits={scheduledVisitsCount}
            propertyCount={propertyCount}
            siteVisits={siteVisits}
            onWonClick={() => setWonDialogOpen(true)}
          />

          <Tabs
            value={mobileChartTab}
            onValueChange={setMobileChartTab}
            className={cn(!isMobile ? "flex-1 flex flex-col min-h-0" : "")}
          >
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="funnel" className="text-xs">
                Funil
              </TabsTrigger>
              <TabsTrigger value="evolution" className="text-xs">
                Evolução
              </TabsTrigger>
              <TabsTrigger value="sources" className="text-xs">
                Origem
              </TabsTrigger>
            </TabsList>
            <TabsContent value="funnel" className={cn("mt-3", !isMobile ? "flex-1 min-h-0" : "")}>
              <div data-tour="dashboard-funnel" className="h-[400px]">{funnelComponent}</div>
            </TabsContent>
            <TabsContent value="evolution" className={cn("mt-3", !isMobile ? "flex-1 min-h-0" : "")}>
              <div data-tour="dashboard-evolution" className="h-[400px]">
                <DealsEvolutionChart data={evolutionData} isLoading={evolutionLoading} />
              </div>
            </TabsContent>
            <TabsContent value="sources" className={cn("mt-3", !isMobile ? "flex-1 min-h-0" : "")}>
              <div data-tour="dashboard-sources" className="h-[450px]">
                <LeadSourcesChart
                  data={sourcesData}
                  isLoading={sourcesLoading}
                  selectedSource={source}
                  onSourceChange={setSource}
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <WonDealsDialog
        open={wonDialogOpen}
        onOpenChange={setWonDialogOpen}
        data={kpiData}
        periodLabel={periodLabel}
        onViewLead={(leadId) => {
          setWonDialogOpen(false);
          navigate(`/crm/pipelines?lead=${leadId}`);
        }}
      />
    </AppLayout>
  );
}

// ==========================================
// HELPER FUNCTIONS & SUB-COMPONENTS
// ==========================================
function formatKPIValue(value: string | number, format: string): string {
  if (typeof value === "string") return value;
  switch (format) {
    case "currency":
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        notation: "standard",
        maximumFractionDigits: 0,
      }).format(value);
    case "percent":
      return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
    default:
      return value.toLocaleString("pt-BR");
  }
}

interface KPICardsGridProps {
  data: any;
  isLoading?: boolean;
  periodLabel: string;
  propertyCount?: number;
  siteVisits?: number;
  scheduledVisits?: number;
  layout?: "top" | "side";
  onWonClick?: () => void;
}

function KPICardsGrid({
  data,
  isLoading,
  periodLabel,
  propertyCount,
  siteVisits,
  scheduledVisits,
  layout = "top",
  onWonClick,
}: KPICardsGridProps) {
  if (isLoading) {
    const isSide = layout === "side";
    return (
      <div className="space-y-3">
        <div className={cn("grid gap-3", isSide ? "grid-cols-2" : "grid-cols-4")}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={`skeleton-top-${i}`} data-tour={["dashboard-kpi-leads", "dashboard-kpi-open", "dashboard-kpi-lost", "dashboard-kpi-won"][i]}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-6 w-12" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                  <Skeleton className="h-9 w-9 rounded-lg" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className={cn("grid gap-3", isSide ? "grid-cols-2" : "grid-cols-5")}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Card
              key={`skeleton-bottom-${i}`}
              data-tour={["dashboard-kpi-visits", "dashboard-kpi-vgv", "dashboard-kpi-first-contact", "dashboard-kpi-properties", "dashboard-kpi-site-visits"][i]}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-6 w-12" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                  <Skeleton className="h-9 w-9 rounded-lg" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const allKpis = [
    {
      title: "Leads",
      value: data.totalLeads,
      icon: Users,
      tooltip: `Total de leads - ${periodLabel}`,
      format: "number",
      color: "primary",
      tourTarget: "dashboard-kpi-leads",
    },
    {
      title: "Em aberto",
      value: data.openLeads ?? 0,
      rate: data.totalLeads > 0 ? ((data.openLeads ?? 0) / data.totalLeads) * 100 : 0,
      icon: CircleDot,
      tooltip: `Percentual de leads em aberto dentro do total do período - ${periodLabel}`,
      format: "number",
      color: "chart-1",
      tourTarget: "dashboard-kpi-open",
    },
    {
      title: "Perdidos",
      value: data.lostLeads ?? 0,
      rate: data.totalLeads > 0 ? ((data.lostLeads ?? 0) / data.totalLeads) * 100 : 0,
      rateVariant: "negative",
      icon: XCircle,
      tooltip: `Percentual de leads perdidos dentro do total do período - ${periodLabel}`,
      format: "number",
      color: "destructive",
      tourTarget: "dashboard-kpi-lost",
    },
    {
      title: "Ganhos",
      value: data.closedLeads,
      rate: data.conversionRate,
      rateLabel: "conversão",
      rateVariant: "auto",
      icon: Trophy,
      tooltip: `Ganhos fechados no período, independente da data de entrada do lead - ${periodLabel}`,
      format: "number",
      color: "success",
      iconColor: "rgb(16, 185, 129)",
      iconBgColor: "rgba(16, 185, 129, 0.1)",
      onClick: onWonClick,
      interactive: true,
      tourTarget: "dashboard-kpi-won",
    },
    {
      title: "Visitas",
      value: scheduledVisits ?? 0,
      rate: data.totalLeads > 0 ? ((scheduledVisits ?? 0) / data.totalLeads) * 100 : 0,
      rateVariant: "auto",
      icon: CalendarCheck,
      tooltip: `Visitas agendadas em relação ao total de leads - ${periodLabel}`,
      format: "number",
      color: "chart-4",
      tourTarget: "dashboard-kpi-visits",
    },
    {
      title: "VGV",
      value: data.totalSalesValue,
      icon: DollarSign,
      tooltip: `Valor em vendas - ${periodLabel}`,
      format: "currency",
      color: "chart-5",
      hideIconOnDesktop: true,
      tourTarget: "dashboard-kpi-vgv",
    },
    {
      title: "1º Contato",
      value: data.avgResponseTime,
      icon: Clock,
      tooltip: "Tempo médio até a primeira ligação ou mensagem",
      format: "time",
      color: "chart-4",
      tourTarget: "dashboard-kpi-first-contact",
    },
    {
      title: "Imóveis",
      value: propertyCount ?? 0,
      icon: Building2,
      tooltip: "Total de imóveis cadastrados",
      format: "number",
      color: "chart-1",
      tourTarget: "dashboard-kpi-properties",
    },
    {
      title: "Visitas no site",
      value: siteVisits ?? 0,
      icon: Eye,
      tooltip: `Visitas ao site no período - ${periodLabel}`,
      format: "number",
      color: "chart-2",
      tourTarget: "dashboard-kpi-site-visits",
    },
  ];

  const renderKPI = (kpi: any) => {
    const Icon = kpi.icon;
    const hasTrend = kpi.trend !== undefined && kpi.trend !== 0;
    const isPositive = (kpi.trend ?? 0) >= 0;
    const isCurrency = kpi.format === "currency";
    const showIcon = !kpi.hideIconOnDesktop || isSide;
    const rateColorClass =
      kpi.rateVariant === "negative"
        ? "text-destructive"
        : kpi.rateVariant === "auto"
          ? kpi.rate > 0
            ? "text-emerald-500"
            : "text-destructive"
          : "text-emerald-500";

    const handleKeyDown = (event: any) => {
      if (!kpi.onClick) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        kpi.onClick();
      }
    };

    return (
      <div key={kpi.title} data-tour={kpi.tourTarget} className="h-full">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Card
              className={cn(
                "card-hover h-full transition-colors",
                kpi.interactive
                  ? "cursor-pointer hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  : "cursor-default",
              )}
              role={kpi.interactive ? "button" : undefined}
              tabIndex={kpi.interactive ? 0 : undefined}
              onClick={kpi.onClick}
              onKeyDown={handleKeyDown}
            >
              <CardContent className="p-3 sm:p-4 h-full">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider font-medium truncate mb-1">
                      {kpi.title}
                    </p>
                    <p
                      className={cn(
                        "font-bold leading-tight",
                        isCurrency ? "text-sm sm:text-lg xl:text-xl break-words" : "text-lg sm:text-2xl truncate",
                      )}
                    >
                      {formatKPIValue(kpi.value, kpi.format)}
                    </p>
                    {hasTrend && (
                      <div className="flex items-center gap-0.5 mt-1">
                        {isPositive ? (
                          <TrendingUp className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-destructive" />
                        )}
                        <span
                          className={cn(
                            "text-[10px] sm:text-xs font-medium",
                            isPositive ? "text-emerald-500" : "text-destructive",
                          )}
                        >
                          {kpi.trend! > 0 ? "+" : ""}
                          {kpi.trend}%
                        </span>
                      </div>
                    )}
                    {kpi.rate !== undefined && (
                      <div className={cn("mt-1 text-[10px] sm:text-xs font-medium", rateColorClass)}>
                        {formatKPIValue(kpi.rate, "percent")} {kpi.rateLabel || "dos leads"}
                      </div>
                    )}
                  </div>
                  {showIcon && (
                    <div
                      className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: kpi.iconBgColor || `hsl(var(--${kpi.color}) / 0.1)` }}
                    >
                      <Icon className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: kpi.iconColor || `hsl(var(--${kpi.color}))` }} />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{kpi.tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      </div>
    );
  };

  const isSide = layout === "side";

  return (
    <div className="space-y-3">
      <div className={cn("grid gap-3", isSide ? "grid-cols-2" : "grid-cols-5")}>
        {allKpis.slice(0, 5).map(renderKPI)}
      </div>
      <div className={cn("grid gap-3", isSide ? "grid-cols-2" : "grid-cols-4")}>{allKpis.slice(5).map(renderKPI)}</div>
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDateTime(value: string | null): string {
  if (!value) return "--";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatConversionDays(days: number | null): string {
  if (days === null) return "--";
  if (days === 0) return "Mesmo dia";
  if (days === 1) return "1 dia";
  if (days < 30) return `${days} dias`;
  const months = Math.round(days / 30);
  return months === 1 ? "1 mês" : `${months} meses`;
}

function WonDealsDialog({
  open,
  onOpenChange,
  data,
  periodLabel,
  onViewLead,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: any;
  periodLabel: string;
  onViewLead: (leadId: string) => void;
}) {
  const wonDeals = data.wonDeals || [];
  const totalWon = data.closedLeads || 0;
  const totalVgv = data.totalSalesValue || 0;
  const averageTicket = totalWon > 0 ? totalVgv / totalWon : 0;
  const averageDays = data.wonAverageConversionDays;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] w-[92vw] max-w-[80vw] overflow-hidden border-border/40 bg-background/95 p-0 shadow-2xl backdrop-blur-xl sm:rounded-xl">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Trophy className="h-5 w-5 text-emerald-500" />
            Ganhos - Tempo de Conversão
          </DialogTitle>
          <DialogDescription>
            {totalWon} ganhos em {periodLabel.toLowerCase()}
            {averageDays !== null && averageDays !== undefined ? ` | média: ${averageDays} dias` : ""}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(80vh-92px)]">
          <div className="space-y-5 px-5 pb-5">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg bg-muted/70 p-3">
                <p className="text-xs text-muted-foreground">Ganhos</p>
                <p className="mt-1 text-2xl font-bold">{totalWon}</p>
              </div>
              <div className="rounded-lg bg-muted/70 p-3">
                <p className="text-xs text-muted-foreground">Conversão</p>
                <p className={cn("mt-1 text-2xl font-bold", data.conversionRate > 0 ? "text-emerald-500" : "text-destructive")}>
                  {formatKPIValue(data.conversionRate || 0, "percent")}
                </p>
              </div>
              <div className="rounded-lg bg-muted/70 p-3">
                <p className="text-xs text-muted-foreground">VGV dos ganhos</p>
                <p className="mt-1 text-xl font-bold text-emerald-500">{formatCurrency(totalVgv)}</p>
              </div>
              <div className="rounded-lg bg-muted/70 p-3">
                <p className="text-xs text-muted-foreground">Ticket médio</p>
                <p className="mt-1 text-xl font-bold">{formatCurrency(averageTicket)}</p>
              </div>
            </div>

            <div className="rounded-lg bg-muted/40 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Tempo até o ganho</h3>
                  <p className="text-xs text-muted-foreground">Distribuição dos fechamentos pela idade do lead.</p>
                </div>
                <p className="text-sm font-semibold text-emerald-500">{formatCurrency(totalVgv)}</p>
              </div>

              <div className="space-y-3">
                {(data.wonConversionBuckets || []).map((bucket: any) => {
                  const hasDeals = bucket.count > 0;
                  const width = hasDeals ? Math.max(4, Math.min(100, bucket.percentage || 0)) : 0;

                  return (
                    <div
                      key={bucket.key}
                      className={cn(
                        "grid grid-cols-[110px_1fr_58px_58px] items-center gap-3 text-xs sm:grid-cols-[140px_1fr_70px_70px]",
                        !hasDeals && "opacity-55",
                      )}
                    >
                      <span className={cn("text-muted-foreground", !hasDeals && "text-[11px]")}>{bucket.label}</span>
                      <div className={cn("overflow-hidden rounded-full bg-background/80", hasDeals ? "h-3" : "h-1.5")}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                            width: `${width}%`,
                          backgroundColor: bucket.color,
                        }}
                      />
                    </div>
                      <span className={cn("text-right font-semibold", !hasDeals && "text-[11px]")}>{bucket.count}</span>
                      <span className={cn("text-right font-semibold", !hasDeals && "text-[11px]")} style={{ color: bucket.color }}>
                      {formatKPIValue(bucket.percentage || 0, "percent")}
                    </span>
                  </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg bg-muted/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Ganhos do período</h3>
                <span className="text-xs text-muted-foreground">{wonDeals.length} registros</span>
              </div>

              {wonDeals.length === 0 ? (
                <div className="rounded-lg bg-background/60 p-4 text-center text-sm text-muted-foreground">
                  Nenhum ganho fechado nesse período.
                </div>
              ) : (
                <div className="space-y-2">
                  {wonDeals.map((deal: any) => (
                    <div
                      key={deal.id}
                      className="grid gap-2 rounded-lg bg-background/70 p-3 text-sm md:grid-cols-[1.2fr_0.8fr_0.8fr_0.7fr_auto] md:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{deal.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {sourceLabels[deal.source || ""] || deal.source || "Origem não informada"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Responsável</p>
                        <p className="truncate font-medium">{deal.assignedUserName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Entrada / ganho</p>
                        <p className="font-medium">{formatDateTime(deal.createdAt)}</p>
                        <p className="text-xs text-emerald-500">{formatDateTime(deal.wonAt)}</p>
                      </div>
                      <div className="md:text-right">
                        <p className="font-semibold text-emerald-500">{formatCurrency(deal.value)}</p>
                        <p className="text-xs text-muted-foreground">{formatConversionDays(deal.conversionDays)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onViewLead(deal.id)}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Visualizar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
