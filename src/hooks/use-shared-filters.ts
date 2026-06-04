import { useState, useMemo, useEffect } from 'react';
import { useFilters } from '@/contexts/FilterContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLeadVisibility, applyVisibilityFilter } from './use-lead-visibility';
import { DatePreset } from './use-dashboard-filters';
import { useTags } from './use-tags';
import { applyLeadIdFilter, fetchDashboardTeamLeadIds } from './use-dashboard-team-leads';

export interface SharedFilters {
  datePreset: DatePreset;
  dateRange: { from: Date; to: Date };
  teamId: string | null;
  userId: string | null;
  source: string | null;
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  tagId: string | null;
  dealStatus: string | null;
  searchQuery: string;
}


export function useSharedFilters() {
  const { user, organization } = useAuth();
  const { data: visibility } = useLeadVisibility(user?.id);
  
  const { 
    datePreset, 
    setDatePreset, 
    customDateRange, 
    setCustomDateRange, 
    activeDateRange: dateRange 
  } = useFilters();

  const [teamId, setTeamId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [adSetId, setAdSetId] = useState<string | null>(null);
  const [adId, setAdId] = useState<string | null>(null);
  const [tagId, setTagId] = useState<string | null>(null);
  const [dealStatus, setDealStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Dynamic Sources
  const { data: dynamicSources = [], isLoading: isLoadingSources } = useQuery({
    queryKey: ['shared-source-options', organization?.id, dateRange, visibility, userId, teamId],
    enabled: !!organization?.id && !!visibility,
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('source')
        .eq('organization_id', organization?.id)
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString())
        .not('source', 'is', null);
      
      query = applyVisibilityFilter(query, visibility!, 'assigned_user_id', userId);
      const teamLeadIds = await fetchDashboardTeamLeadIds(teamId, null);
      query = applyLeadIdFilter(query, teamLeadIds);

      const { data } = await query;
      const distinctSources = [...new Set(data?.map(l => l.source))].filter(Boolean);
      
      return distinctSources.map(s => ({
        value: s as string,
        label: (s as string).charAt(0).toUpperCase() + (s as string).slice(1)
      }));
    }
  });

  // Dynamic Campaigns
  const { data: campaigns = [], isLoading: isLoadingCampaigns } = useQuery({
    queryKey: ['shared-campaigns', organization?.id, dateRange, visibility, userId, teamId],
    enabled: !!organization?.id && !!visibility,
    queryFn: async () => {
      let query = supabase
        .from('lead_meta')
        .select('campaign_id, campaign_name, leads!inner(id, organization_id, created_at, assigned_user_id)')
        .eq('leads.organization_id', organization?.id)
        .gte('leads.created_at', dateRange.from.toISOString())
        .lte('leads.created_at', dateRange.to.toISOString())
        .not('campaign_id', 'is', null);
      
      query = applyVisibilityFilter(query, visibility!, 'leads.assigned_user_id', userId);
      const teamLeadIds = await fetchDashboardTeamLeadIds(teamId, null);
      if (teamLeadIds !== null) {
        query = teamLeadIds.length === 0
          ? query.eq('leads.id', '00000000-0000-0000-0000-000000000000')
          : query.in('leads.id', teamLeadIds);
      }

      const { data } = await query;
      const unique = new Map();
      data?.forEach(item => {
        if (item.campaign_id) {
          unique.set(item.campaign_id, item.campaign_name || item.campaign_id);
        }
      });
      
      return Array.from(unique.entries()).map(([id, name]) => ({ id, name }));
    }
  });

  // Dynamic AdSets
  const { data: adSets = [], isLoading: isLoadingAdSets } = useQuery({
    queryKey: ['shared-adsets', organization?.id, dateRange, campaignId, visibility, userId, teamId],
    enabled: !!campaignId && !!organization?.id && !!visibility,
    queryFn: async () => {
      let query = supabase
        .from('lead_meta')
        .select('adset_id, adset_name, leads!inner(id, organization_id, created_at, assigned_user_id)')
        .eq('leads.organization_id', organization?.id)
        .eq('campaign_id', campaignId)
        .gte('leads.created_at', dateRange.from.toISOString())
        .lte('leads.created_at', dateRange.to.toISOString())
        .not('adset_id', 'is', null);

      query = applyVisibilityFilter(query, visibility!, 'leads.assigned_user_id', userId);
      const teamLeadIds = await fetchDashboardTeamLeadIds(teamId, null);
      if (teamLeadIds !== null) {
        query = teamLeadIds.length === 0
          ? query.eq('leads.id', '00000000-0000-0000-0000-000000000000')
          : query.in('leads.id', teamLeadIds);
      }

      const { data } = await query;
      const unique = new Map();
      data?.forEach(item => {
        if (item.adset_id) {
          unique.set(item.adset_id, item.adset_name || item.adset_id);
        }
      });
      return Array.from(unique.entries()).map(([id, name]) => ({ id, name }));
    }
  });

  // Dynamic Ads
  const { data: ads = [], isLoading: isLoadingAds } = useQuery({
    queryKey: ['shared-ads', organization?.id, dateRange, adSetId, visibility, userId, teamId],
    enabled: !!adSetId && !!organization?.id && !!visibility,
    queryFn: async () => {
      let query = supabase
        .from('lead_meta')
        .select('ad_id, ad_name, leads!inner(id, organization_id, created_at, assigned_user_id)')
        .eq('leads.organization_id', organization?.id)
        .eq('adset_id', adSetId)
        .gte('leads.created_at', dateRange.from.toISOString())
        .lte('leads.created_at', dateRange.to.toISOString())
        .not('ad_id', 'is', null);

      query = applyVisibilityFilter(query, visibility!, 'leads.assigned_user_id', userId);
      const teamLeadIds = await fetchDashboardTeamLeadIds(teamId, null);
      if (teamLeadIds !== null) {
        query = teamLeadIds.length === 0
          ? query.eq('leads.id', '00000000-0000-0000-0000-000000000000')
          : query.in('leads.id', teamLeadIds);
      }

      const { data } = await query;
      const unique = new Map();
      data?.forEach(item => {
        if (item.ad_id) {
          unique.set(item.ad_id, item.ad_name || item.ad_id);
        }
      });
      return Array.from(unique.entries()).map(([id, name]) => ({ id, name }));
    }
  });

  // Tags
  const { data: tags = [] } = useTags();

  // Cascading resets
  useEffect(() => {
    setSource(null);
    setCampaignId(null);
    setAdSetId(null);
    setAdId(null);
  }, [datePreset, customDateRange]);

  useEffect(() => {
    setAdSetId(null);
    setAdId(null);
  }, [campaignId]);

  useEffect(() => {
    setAdId(null);
  }, [adSetId]);

  useEffect(() => {
    setUserId(null);
  }, [teamId]);

  // Auto-selection
  useEffect(() => {
    if (!isLoadingAdSets && adSets.length === 1 && campaignId && !adSetId) {
      setAdSetId(adSets[0].id);
    }
  }, [adSets, isLoadingAdSets, campaignId]);

  useEffect(() => {
    if (!isLoadingAds && ads.length === 1 && adSetId && !adId) {
      setAdId(ads[0].id);
    }
  }, [ads, isLoadingAds, adSetId]);

  const filters: SharedFilters = useMemo(() => ({
    datePreset,
    dateRange,
    teamId,
    userId,
    source,
    campaignId,
    adSetId,
    adId,
    tagId,
    dealStatus,
    searchQuery,
  }), [datePreset, dateRange, teamId, userId, source, campaignId, adSetId, adId, tagId, dealStatus, searchQuery]);


  const clearFilters = () => {
    setDatePreset('last30days');
    setCustomDateRange(null);
    setTeamId(null);
    setUserId(null);
    setSource(null);
    setCampaignId(null);
    setAdSetId(null);
    setAdId(null);
    setTagId(null);
    setDealStatus(null);
    setSearchQuery('');
  };

  const hasActiveFilters = 
    teamId !== null || 
    (userId !== null && userId !== 'all') || 
    source !== null || 
    campaignId !== null || 
    adSetId !== null || 
    adId !== null || 
    tagId !== null || 
    dealStatus !== null || 
    searchQuery !== '' ||
    datePreset !== 'last30days';

  return {
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
    // Dynamic data
    dynamicSources,
    campaigns,
    adSets,
    ads,
    tags,
    isLoadingSources,
    isLoadingCampaigns,
    isLoadingAdSets,
    isLoadingAds
  };
}
