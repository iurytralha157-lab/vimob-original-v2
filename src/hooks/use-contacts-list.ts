import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ContactListFilters {
  search?: string;
  pipelineId?: string;
  stageId?: string;
  assigneeId?: string;
  unassigned?: boolean;
  tagId?: string;
  source?: string;
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
      const { data, error } = await (supabase as any).rpc('list_contacts_paginated', {
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
      });

      if (error) throw error;

      // Parse tags from jsonb
      const items = Array.isArray(data) ? data : [];
      return items.map((row: any) => ({
        ...row,
        tags: Array.isArray(row.tags) ? row.tags : [],
      })) as Contact[];
    },
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5, // Cache por 5 minutos
    gcTime: 1000 * 60 * 15,
  });
}
