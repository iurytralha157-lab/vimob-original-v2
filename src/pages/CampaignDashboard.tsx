import React, { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { SharedFilters } from '@/components/shared/SharedFilters';
import { useSharedFilters } from '@/hooks/use-shared-filters';
import { datePresetOptions } from '@/hooks/use-dashboard-filters';

import { useCampaignInsights, useSyncCampaignInsights } from '@/hooks/use-campaign-insights';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  TrendingUp, 
  BarChart3,
  RefreshCw
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function CampaignDashboard() {
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


  const { data: insightData, isLoading } = useCampaignInsights(filters);
  const syncMutation = useSyncCampaignInsights();

  const handleSync = React.useCallback(() => {
    syncMutation.mutate({
      dateStart: filters.dateRange.from.toISOString().split('T')[0],
      dateStop: filters.dateRange.to.toISOString().split('T')[0]
    });
  }, [filters.dateRange.from, filters.dateRange.to, syncMutation]);

  // Automatic sync on mount or date change
  React.useEffect(() => {
    // Only sync automatically if we haven't synced in the last hour or if explicitly requested
    const lastSyncTime = insightData?.lastSync ? new Date(insightData.lastSync).getTime() : 0;
    const oneHourAgo = new Date().getTime() - 5 * 60 * 1000;
    
    if (lastSyncTime < oneHourAgo && !isLoading && !syncMutation.isPending) {
      handleSync();
    }
  }, [filters.dateRange.from, filters.dateRange.to, insightData?.lastSync]);

  const totals = useMemo(() => {
    if (!insightData?.summary) return { spend: 0, leads: 0, conversations: 0, impressions: 0, reach: 0, cpl: 0 };
    
    const spend = insightData.summary.totalSpend || 0;
    const leads = insightData.summary.totalLeads || 0;
    const conversations = insightData.summary.conversations_count || 0;
    const totalResults = leads + conversations;
    const avgCpl = totalResults > 0 ? spend / totalResults : 0;

    return {
      spend,
      leads,
      conversations,
      impressions: insightData.summary.totalImpressions || 0,
      reach: insightData.summary.totalReach || 0,
      cpl: avgCpl
    };
  }, [insightData]);

  const campaignStats = useMemo(() => {
    if (!insightData?.campaigns) return [];
    
    // Filtra campanhas que não tiveram atividade no período
    return insightData.campaigns
      .filter(c => (c.spend || 0) > 0 || (c.impressions || 0) > 0 || (c.leads_count || 0) > 0 || (c.conversations_count || 0) > 0)
      .map(c => {
        const isMessages = c.objective === 'MESSAGES' || c.objective === 'OUTCOME_MESSAGES';
        const results = isMessages ? (c.conversations_count || 0) : (c.leads_count || 0);
        const dynamicCpl = results > 0 ? (c.spend || 0) / results : 0;

        return {
          id: c.campaign_id,
          name: c.campaign_name,
          spend: c.spend || 0,
          leads: c.leads_count,
          conversations: c.conversations_count || 0,
          impressions: c.impressions || 0,
          reach: c.reach || 0,
          cpl: dynamicCpl, // Usamos o CPL dinâmico baseado no objetivo
          status: c.status,
          budget: c.budget,
          budgetType: c.budget_type,
          objective: c.objective
        };
      });
  }, [insightData]);

  // For the chart, we'll use campaign data since useCampaignInsights returns aggregated data
  // In a more complete version, we would have daily data
  const chartData = useMemo(() => {
    if (!insightData?.dailyData) return [];
    return insightData.dailyData;
  }, [insightData]);

  const formatXAxis = (dateStr: string) => {
    try {
      const date = new Date(dateStr + 'T12:00:00');
      return format(date, "dd, EEE", { locale: ptBR });
    } catch (e) {
      return dateStr;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('pt-BR').format(value);
  };

  const periodLabel = datePresetOptions.find(o => o.value === datePreset)?.label || 'Período selecionado';

  return (
    <AppLayout title="Dashboard de Campanhas">
      <div className="flex flex-col gap-6 animate-fade-in">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {insightData?.lastSync && (
              <Badge variant="outline" className="font-normal text-[10px] py-1 px-3 h-auto bg-muted/50 border-border">
                <span className="flex items-center gap-1.5">
                  <RefreshCw className={cn("h-3 w-3", syncMutation.isPending && "animate-spin")} />
                  Última sincronização: {format(new Date(insightData.lastSync), "HH:mm 'de' dd/MM", { locale: ptBR })}
                </span>
              </Badge>
            )}
            {syncMutation.isPending && (
              <span className="text-xs text-muted-foreground animate-pulse">Sincronizando com Meta...</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <KPICard 
            title="Investimento" 
            value={formatCurrency(totals.spend)} 
            isLoading={isLoading}
          />
          <KPICard 
            title="Leads" 
            value={formatNumber(totals.leads)} 
            isLoading={isLoading}
          />
          <KPICard 
            title="Conversas" 
            value={formatNumber(totals.conversations)} 
            isLoading={isLoading}
          />
          <KPICard 
            title="CPL Médio" 
            value={formatCurrency(totals.cpl)} 
            isLoading={isLoading}
          />
          <KPICard 
            title="Alcance" 
            value={formatNumber(totals.reach)} 
            isLoading={isLoading}
          />
        </div>


        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Evolução de Conversões (Leads e Conversas)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                {isLoading ? (
                  <Skeleton className="h-full w-full" />
                ) : chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorConversations" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="date" 
                        axisLine={false}
                        tickLine={false}
                        fontSize={10}
                        tick={{ fill: '#888' }}
                        tickFormatter={formatXAxis}
                      />
                      <YAxis axisLine={false} tickLine={false} fontSize={12} tick={{ fill: '#888' }} />
                      <RechartsTooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        labelFormatter={formatXAxis}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="leads" 
                        name="Leads" 
                        stroke="#10b981" 
                        fillOpacity={1} 
                        fill="url(#colorLeads)" 
                        strokeWidth={2}
                        stackId="1"
                      />
                      <Area 
                        type="monotone" 
                        dataKey="conversations" 
                        name="Conversas" 
                        stroke="#3b82f6" 
                        fillOpacity={1} 
                        fill="url(#colorConversations)" 
                        strokeWidth={2}
                        stackId="1"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    Sem dados para o período selecionado
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Leads por Campanha
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                {isLoading ? (
                  <Skeleton className="h-full w-full" />
                ) : campaignStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={campaignStats.slice(0, 5)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                      <XAxis type="number" hide />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        width={120} 
                        axisLine={false} 
                        tickLine={false} 
                        fontSize={11}
                        tick={{ fill: '#555' }}
                      />
                      <RechartsTooltip 
                        cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      />
                      <Bar 
                        dataKey="leads" 
                        name="Leads" 
                        fill="#10b981" 
                        radius={[0, 4, 4, 0]} 
                        barSize={24}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    Sem dados para o período selecionado
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Campaign List */}
        <Card>
          <CardHeader>
            <CardTitle>Detalhamento de Campanhas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 font-medium">Campanha</th>
                    <th className="text-right py-3 font-medium">Status</th>
                    <th className="text-right py-3 font-medium">Orçamento</th>
                    <th className="text-right py-3 font-medium">Investimento</th>
                    <th className="text-right py-3 font-medium">Resultado</th>
                    <th className="text-right py-3 font-medium">CPR (Lead/Conv)</th>
                    <th className="text-right py-3 font-medium">Alcance / Imp.</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-3"><Skeleton className="h-4 w-40" /></td>
                        <td className="py-3 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                        <td className="py-3 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
                        <td className="py-3 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                        <td className="py-3 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                      </tr>
                    ))
                  ) : campaignStats.length > 0 ? (
                    campaignStats.map((campaign) => (
                      <tr key={campaign.id} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="py-3 font-medium">
                          <div className="flex flex-col">
                            <span>{campaign.name}</span>
                            <span className="text-[10px] text-muted-foreground">ID: {campaign.id}</span>
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          <Badge 
                            variant="outline" 
                            className={cn(
                              "text-[10px] border-transparent",
                              campaign.status === 'ACTIVE' 
                                ? "bg-green-50 text-green-700 border-green-200" 
                                : "bg-gray-50 text-gray-700 border-gray-200"
                            )}
                          >
                            {campaign.status === 'ACTIVE' ? 'Ativa' : 'Pausada'}
                          </Badge>
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex flex-col">
                            <span className="font-medium text-xs">
                              {campaign.budget ? formatCurrency(campaign.budget) : 'N/A'}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {campaign.budgetType === 'daily' ? 'Diário' : 'Vitalício'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 text-right">{formatCurrency(campaign.spend)}</td>
                        <td className="py-3 text-right">
                          <div className="flex flex-col">
                            {campaign.objective === 'MESSAGES' || campaign.objective === 'OUTCOME_MESSAGES' ? (
                              <span className="font-medium">{formatNumber(campaign.conversations)} Conversas</span>
                            ) : (
                              <span className="font-medium">{formatNumber(campaign.leads)} Leads</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex flex-col items-end">
                            <Badge variant="secondary" className="font-normal text-[10px]">
                              {formatCurrency(campaign.cpl)}
                            </Badge>
                            <span className="text-[9px] text-muted-foreground mt-0.5">
                              {campaign.objective === 'MESSAGES' || campaign.objective === 'OUTCOME_MESSAGES' ? 'por conversa' : 'por lead'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex flex-col text-xs">
                            <span>{formatNumber(campaign.reach)} Alcance</span>
                            <span className="text-muted-foreground">{formatNumber(campaign.impressions)} Imp.</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground">
                        Nenhuma campanha encontrada no período
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

interface KPICardProps {
  title: string;
  value: string;
  isLoading: boolean;
}

function KPICard({ title, value, isLoading }: KPICardProps) {
  if (isLoading) return <Skeleton className="h-24 w-full rounded-xl" />;
  
  return (
    <Card className="overflow-hidden border-none shadow-sm bg-card hover:shadow-md transition-all duration-300 group">
      <CardContent className="p-5 flex flex-col items-center justify-center text-center gap-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider group-hover:text-primary transition-colors">
          {title}
        </p>
        <p className="text-2xl font-bold text-foreground tracking-tight">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
