import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ContactListFilters {
  search?: string;
  teamId?: string;
  pipelineId?: string;
  stageId?: string;
  assigneeId?: string;
  unassigned?: boolean;
  tagId?: string;
  source?: string;
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  dealStatus?: 'open' | 'won' | 'lost';
  createdFrom?: string;
  createdTo?: string;
  sortBy?: 'created_at' | 'name' | 'last_interaction_at' | 'stage';
  sortDir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface ContactTag {
  id: string;
  name: string;
  color: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  whatsapp_avatar_url: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  stage_name: string | null;
  stage_color: string | null;
  assigned_user_id: string | null;
  assignee_name: string | null;
  assignee_avatar: string | null;
  source: string;
  created_at: string;
  sla_status: string | null;
  last_interaction_at: string | null;
  last_interaction_preview: string | null;
  last_interaction_channel: string | null;
  tags: ContactTag[];
  total_count: number;
  deal_status: 'open' | 'won' | 'lost' | null;
  lost_reason: string | null;
  last_entry_at: string | null;
  reentry_count: number;
}

export function useContactsList(filters: ContactListFilters) {
  return useQuery({
    queryKey: ['contacts-list', filters],
    queryFn: async () => {
      const hasMetaFilter = !!(filters.campaignId || filters.adSetId || filters.adId);
      let metaLeadIds: Set<string> | null = null;

      if (hasMetaFilter) {
        let metaQuery = supabase.from('lead_meta').select('lead_id, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name');

        if (filters.campaignId) {
          metaQuery = /^\d+$/.test(filters.campaignId)
            ? metaQuery.eq('campaign_id', filters.campaignId)
            : metaQuery.eq('campaign_name', filters.campaignId);
        }
        if (filters.adSetId) {
          metaQuery = /^\d+$/.test(filters.adSetId)
            ? metaQuery.eq('adset_id', filters.adSetId)
            : metaQuery.eq('adset_name', filters.adSetId);
        }
        if (filters.adId) {
          metaQuery = /^\d+$/.test(filters.adId)
            ? metaQuery.eq('ad_id', filters.adId)
            : metaQuery.eq('ad_name', filters.adId);
        }

        const { data: metaRows, error: metaError } = await metaQuery;
        if (metaError) throw metaError;

        metaLeadIds = new Set((metaRows || []).map((row) => row.lead_id).filter(Boolean));
        if (metaLeadIds.size === 0) return [];
      }

      const normalizeRows = (rows: any[], totalCount?: number) =>
        rows.map((row: any) => ({
          ...row,
          tags: Array.isArray(row.tags) ? row.tags : [],
          total_count: totalCount ?? row.total_count,
        })) as Contact[];

      const buildRpcArgs = (overrides: Record<string, unknown> = {}) => ({
        p_search: filters.search || null,
        p_pipeline_id: filters.pipelineId || null,
        p_stage_id: filters.stageId || null,
        p_assignee_id: filters.unassigned ? null : (filters.assigneeId || null),
        p_unassigned: filters.unassigned || false,
        p_tag_id: filters.tagId || null,
        p_source: filters.source || null,
        p_deal_status: filters.dealStatus || null,
        p_created_from: filters.createdFrom || null,
        p_created_to: filters.createdTo || null,
        p_sort_by: filters.sortBy || 'created_at',
        p_sort_dir: filters.sortDir || 'desc',
        p_page: filters.page || 1,
        p_limit: filters.limit || 25,
        ...overrides,
      });

      if (filters.teamId && !filters.assigneeId && !filters.unassigned) {
        const { data: teamMembers, error: membersError } = await supabase
          .from('team_members')
          .select('user_id')
          .eq('team_id', filters.teamId);

        if (membersError) throw membersError;

        const memberIds = [...new Set((teamMembers || []).map((member) => member.user_id).filter(Boolean))];
        if (memberIds.length === 0) return [];

        const requestedPage = filters.page || 1;
        const requestedLimit = filters.limit || 25;
        const fetchLimit = Math.max(requestedPage * requestedLimit, requestedLimit);

        const results = await Promise.all(
          memberIds.map((memberId) =>
            (supabase as any).rpc(
              'list_contacts_paginated',
              buildRpcArgs({
                p_assignee_id: memberId,
                p_unassigned: false,
                p_page: 1,
                p_limit: fetchLimit,
              }),
            ),
          ),
        );

        const firstError = results.find((result) => result.error)?.error;
        if (firstError) throw firstError;

        const combined = results.flatMap((result) => (Array.isArray(result.data) ? result.data : []));
        const totalCount = results.reduce((total, result) => total + Number(result.data?.[0]?.total_count || 0), 0);
        const uniqueById = new Map<string, any>();

        combined.forEach((row: any) => {
          if (row?.id) uniqueById.set(row.id, row);
        });

        const sortBy = filters.sortBy || 'created_at';
        const sortDir = filters.sortDir || 'desc';
        const rowsAfterMeta = metaLeadIds
          ? Array.from(uniqueById.values()).filter((row: any) => metaLeadIds!.has(row.id))
          : Array.from(uniqueById.values());

        const sorted = rowsAfterMeta.sort((a: any, b: any) => {
          const direction = sortDir === 'asc' ? 1 : -1;
          const aValue = sortBy === 'name' ? a.name : sortBy === 'stage' ? a.stage_name : sortBy === 'last_interaction_at' ? a.last_interaction_at : a.created_at;
          const bValue = sortBy === 'name' ? b.name : sortBy === 'stage' ? b.stage_name : sortBy === 'last_interaction_at' ? b.last_interaction_at : b.created_at;

          return String(aValue || '').localeCompare(String(bValue || '')) * direction;
        });

        const start = (requestedPage - 1) * requestedLimit;
        const filteredTotal = rowsAfterMeta.length;
        return normalizeRows(sorted.slice(start, start + requestedLimit), metaLeadIds ? filteredTotal : totalCount);
      }

      if (metaLeadIds) {
        const requestedPage = filters.page || 1;
        const requestedLimit = filters.limit || 25;

        const { data, error } = await (supabase as any).rpc(
          'list_contacts_paginated',
          buildRpcArgs({
            p_page: 1,
            p_limit: 10000,
          }),
        );

        if (error) throw error;

        const filtered = (Array.isArray(data) ? data : []).filter((row: any) => metaLeadIds!.has(row.id));
        const start = (requestedPage - 1) * requestedLimit;
        return normalizeRows(filtered.slice(start, start + requestedLimit), filtered.length);
      }

      const { data, error } = await (supabase as any).rpc('list_contacts_paginated', buildRpcArgs());

      if (error) throw error;

      const items = Array.isArray(data) ? data : [];
      return normalizeRows(items);
    },
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5, // Cache por 5 minutos
    gcTime: 1000 * 60 * 15,
  });
}
