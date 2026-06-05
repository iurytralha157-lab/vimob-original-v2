import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { normalizePhone } from '@/lib/phone-utils';
import { useAuth } from '@/contexts/AuthContext';

export type Stage = Tables<'stages'> & {
  lead_count?: number;
};

interface FilteredStageCountsParams {
  pipelineId?: string;
  stageIds: string[];
  filterUser?: string;
  filterTag?: string;
  filterDealStatus?: string;
  searchQuery?: string;
  dateRange?: { from: Date; to: Date } | null;
  filterCampaign?: string;
  filterAdSet?: string;
  filterAd?: string;
  filterSource?: string;
}

// Limite de leads por estágio para paginação inicial (otimizado para performance)
const LEADS_PER_STAGE = 12;

const LEAD_PIPELINE_BASIC_FIELDS = `
  id, name, phone, email, source, created_at,
  stage_id, assigned_user_id, pipeline_id, message,
  stage_entered_at, organization_id,
  whatsapp_avatar_url,
  deal_status, valor_interesse, property_id, lost_reason, won_at, lost_at,
  interest_property_id, interest_plan_id,
  first_response_at, first_response_seconds, first_response_is_automation
`;

// Helper para buscar IDs de leads filtrados por tags ou Meta Ads (joins complexos)
// Retorna:
//   null  → não há filtro de tag/meta ativo (não aplicar .in('id', ...))
//   []    → filtro ativo mas não há leads correspondentes (curto-circuito → 0 resultados)
//   [ids] → leads que casam com TODOS os filtros de join ativos
async function getFilteredLeadIds(filters: {
  filterTag?: string;
  filterCampaign?: string;
  filterAdSet?: string;
  filterAd?: string;
}): Promise<string[] | null> {
  const hasTagFilter = !!(filters.filterTag && filters.filterTag !== 'all');
  const hasMetaFilter = !!(
    (filters.filterCampaign && filters.filterCampaign !== 'all') ||
    (filters.filterAdSet && filters.filterAdSet !== 'all') ||
    (filters.filterAd && filters.filterAd !== 'all')
  );

  if (!hasTagFilter && !hasMetaFilter) return null;

  let currentFilteredIds: string[] | null = null;
  try {
    if (hasTagFilter) {
      const { data: taggedLeads, error } = await supabase
        .from('lead_tags')
        .select('lead_id')
        .eq('tag_id', filters.filterTag!);
      
      if (error) throw error;

      currentFilteredIds = Array.from(
        new Set((taggedLeads || []).map((item) => item.lead_id).filter(Boolean))
      );
      
      if (currentFilteredIds.length === 0) return [];
    }

    if (hasMetaFilter) {
      let metaQuery = supabase.from('lead_meta').select('lead_id, campaign_id, campaign_name');
      
      if (filters.filterCampaign && filters.filterCampaign !== 'all') {
        // Se o valor parece um ID (numérico longo), filtramos por ID, senão por nome
        const isId = /^\d+$/.test(filters.filterCampaign);
        if (isId) {
          metaQuery = metaQuery.eq('campaign_id', filters.filterCampaign);
        } else {
          metaQuery = metaQuery.eq('campaign_name', filters.filterCampaign);
        }
      }
      
      if (filters.filterAdSet && filters.filterAdSet !== 'all') {
        const isId = /^\d+$/.test(filters.filterAdSet);
        if (isId) {
          metaQuery = metaQuery.eq('adset_id', filters.filterAdSet);
        } else {
          metaQuery = metaQuery.eq('adset_name', filters.filterAdSet);
        }
      }
      
      if (filters.filterAd && filters.filterAd !== 'all') {
        const isId = /^\d+$/.test(filters.filterAd);
        if (isId) {
          metaQuery = metaQuery.eq('ad_id', filters.filterAd);
        } else {
          metaQuery = metaQuery.eq('ad_name', filters.filterAd);
        }
      }

      const { data: metaLeads, error } = await metaQuery;
      if (error) throw error;

      const metaIds = Array.from(
        new Set((metaLeads || []).map((item) => item.lead_id).filter(Boolean))
      );

      if (currentFilteredIds === null) {
        currentFilteredIds = metaIds;
      } else {
        const metaSet = new Set(metaIds);
        currentFilteredIds = currentFilteredIds.filter((id) => metaSet.has(id));
      }
    }

    return currentFilteredIds || [];
  } catch (err) {
    console.error('[Pipeline filters] getFilteredLeadIds error:', err);
    return [];
  }
}

// =====================================================================
// FUNÇÃO ÚNICA de aplicação de filtros da Pipeline.
// Usada por: useStagesWithLeads, useLoadMoreLeads, useFilteredStageCounts.
// Garante que TODOS os filtros ativos são aplicados em conjunto (AND).
// =====================================================================
export interface PipelineQueryFilters {
  dateRange?: { from: Date; to: Date } | null;
  filterTag?: string;
  filterDealStatus?: string;
  searchQuery?: string;
  filterCampaign?: string;
  filterAdSet?: string;
  filterAd?: string;
  filterSource?: string;
}

export async function buildPipelineLeadQueryFilters(params: {
  filterUserId?: string;
  filters?: PipelineQueryFilters;
}): Promise<{
  filteredLeadIds: string[] | null;
  isEmpty: boolean;
  apply: (query: any) => any;
}> {
  const { filterUserId, filters = {} } = params;
  const filteredLeadIds = await getFilteredLeadIds({
    filterTag: filters.filterTag,
    filterCampaign: filters.filterCampaign,
    filterAdSet: filters.filterAdSet,
    filterAd: filters.filterAd,
  });

  const isEmpty = filteredLeadIds !== null && filteredLeadIds.length === 0;

  const apply = (query: any) => {
    const normalizedSearch = filters.searchQuery?.trim();

    if (filterUserId && filterUserId !== 'all') {
      query = query.eq('assigned_user_id', filterUserId);
    }
    if (filters.filterDealStatus && filters.filterDealStatus !== 'all') {
      query = query.eq('deal_status', filters.filterDealStatus);
    }
    if (filters.dateRange) {
      query = query
        .gte('created_at', filters.dateRange.from.toISOString())
        .lte('created_at', filters.dateRange.to.toISOString());
    }
    if (filteredLeadIds) {
      query = query.in('id', filteredLeadIds);
    }
    if (filters.filterSource && filters.filterSource !== 'all') {
      query = query.eq('source', filters.filterSource);
    }
    if (normalizedSearch) {
      query = query.or(
        `name.ilike.%${normalizedSearch}%,phone.ilike.%${normalizedSearch}%,email.ilike.%${normalizedSearch}%`
      );
    }
    return query;
  };

  return { filteredLeadIds, isEmpty, apply };
}

export function useStages(pipelineId?: string) {
  return useQuery({
    queryKey: ['stages', pipelineId],
    queryFn: async () => {
      let query = supabase
        .from('stages')
        .select('id, name, color, stage_key, position, pipeline_id')
        .order('position');
      
      if (pipelineId) {
        query = query.eq('pipeline_id', pipelineId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      const stages = data || [];
      
      return stages.map(stage => ({
        ...stage,
        lead_count: 0,
      })) as Stage[];
    },
    staleTime: 1000 * 60 * 10,
  });
}

export function useStagesWithLeads(
  pipelineId?: string, 
  filterUserId?: string,
  filters?: {
    dateRange?: { from: Date; to: Date } | null;
    filterTag?: string;
    filterDealStatus?: string;
    searchQuery?: string;
    filterCampaign?: string;
    filterAdSet?: string;
    filterAd?: string;
    filterSource?: string;
  },
  options?: {
    enabled?: boolean;
  }
) {
  const dateFromISO = filters?.dateRange?.from?.toISOString();
  const dateToISO = filters?.dateRange?.to?.toISOString();
  
  return useQuery({
    queryKey: [
      'stages-with-leads', 
      pipelineId, 
      filterUserId, 
      dateFromISO, 
      dateToISO, 
      filters?.filterTag, 
      filters?.filterDealStatus, 
      filters?.searchQuery, 
      filters?.filterCampaign, 
      filters?.filterAdSet, 
      filters?.filterAd,
      filters?.filterSource
    ],
    staleTime: 30000,
    gcTime: 1000 * 60 * 15,
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      try {
        let targetPipelineId = pipelineId;
        if (!targetPipelineId) {
          const { data: pipeline } = await supabase
            .from('pipelines')
            .select('id')
            .eq('is_default', true)
            .maybeSingle();
          targetPipelineId = pipeline?.id;
        }

        if (!targetPipelineId) return [];

        const stagesResult = await supabase
          .from('stages')
          .select('id, name, color, stage_key, position, pipeline_id')
          .eq('pipeline_id', targetPipelineId)
          .order('position');

        if (stagesResult.error) throw stagesResult.error;
        const stages = stagesResult.data || [];

        // Função única de aplicação de filtros (mesma usada em load-more e counts)
        const { isEmpty, apply } = await buildPipelineLeadQueryFilters({
          filterUserId,
          filters,
        });

        // Curto-circuito quando o filtro de join não retornou nenhum id
        if (isEmpty) {
          return stages.map((stage) => ({
            ...stage,
            leads: [],
            total_lead_count: 0,
            has_more: false,
          }));
        }

        const stageLeadsPromises = stages.map((stage) => {
          const query = (supabase as any)
            .from('leads')
            .select(LEAD_PIPELINE_BASIC_FIELDS, { count: 'exact' })
            .eq('pipeline_id', targetPipelineId)
            .eq('stage_id', stage.id)
            .order('stage_entered_at', { ascending: false })
            .limit(LEADS_PER_STAGE);
          return apply(query);
        });

        const stageLeadsResults = await Promise.all(stageLeadsPromises);

        const totalCountsByStage: Record<string, number> = {};
        stages.forEach((stage, index) => {
          const count = stageLeadsResults[index]?.count || 0;
          totalCountsByStage[stage.id] = count;
        });

        const stageLeadRowsById: Record<string, any[]> = {};

        stages.forEach((stage, index) => {
          const result = stageLeadsResults[index];
          if (result?.error) {
            console.warn('[Pipeline] stage lead query failed:', result.error);
          }

          stageLeadRowsById[stage.id] = result?.data || [];
        });

        const leads: any[] = [];
        stages.forEach((stage) => {
          leads.push(...(stageLeadRowsById[stage.id] || []));
        });

        const enrichedLeads = await getEnrichedLeadsBatch(leads);

        const enrichedLeadsByStage: Record<string, any[]> = {};
        enrichedLeads.forEach((lead) => {
          if (!enrichedLeadsByStage[lead.stage_id]) {
            enrichedLeadsByStage[lead.stage_id] = [];
          }
          enrichedLeadsByStage[lead.stage_id].push(lead);
        });

        return stages.map((stage) => ({
          ...stage,
          leads: enrichedLeadsByStage[stage.id] || [],
          total_lead_count: totalCountsByStage[stage.id] || 0,
          has_more: (totalCountsByStage[stage.id] || 0) > LEADS_PER_STAGE,
        }));
      } catch (err) {
        console.error('[Pipeline filters] useStagesWithLeads error:', err);
        // Sempre encerrar loading — nunca travar a Pipeline
        return [];
      }
    },
  });
}


async function getEnrichedLeadsBatch(leads: any[]) {
  const leadIds = leads.map(l => l.id);
  if (leadIds.length === 0) return [];

  const userIds = Array.from(new Set(leads.map(l => l.assigned_user_id).filter(Boolean)));
  const propertyIds = Array.from(new Set(leads.map(l => l.interest_property_id).filter(Boolean)));
  const planIds = Array.from(new Set(leads.map(l => l.interest_plan_id).filter(Boolean)));

  const [tagsResult, taskCountsResult, usersResult, propertiesResult, plansResult, metaResult] = await Promise.all([
    supabase.from('lead_tags').select('lead_id, tag:tags(id, name, color)').in('lead_id', leadIds),
    supabase.from('lead_tasks').select('lead_id, is_done').in('lead_id', leadIds),
    userIds.length > 0
      ? supabase.from('users').select('id, name, avatar_url').in('id', userIds)
      : Promise.resolve({ data: [] } as any),
    propertyIds.length > 0
      ? supabase.from('properties').select('id, code, title, preco').in('id', propertyIds)
      : Promise.resolve({ data: [] } as any),
    planIds.length > 0
      ? supabase.from('service_plans').select('id, code, name, price').in('id', planIds)
      : Promise.resolve({ data: [] } as any),
    supabase.from('lead_meta').select('lead_id, campaign_name, campaign_id, adset_name, adset_id, ad_name, ad_id, platform').in('lead_id', leadIds),
  ]);

  const tagsByLead = (tagsResult.data || []).reduce((acc: any, lt: any) => {
    if (!acc[lt.lead_id]) acc[lt.lead_id] = [];
    if (lt.tag) acc[lt.lead_id].push(lt.tag);
    return acc;
  }, {});

  const tasksByLead = (taskCountsResult.data || []).reduce((acc: any, t: any) => {
    if (!acc[t.lead_id]) acc[t.lead_id] = { pending: 0, completed: 0 };
    if (t.is_done) acc[t.lead_id].completed++;
    else acc[t.lead_id].pending++;
    return acc;
  }, {});

  const usersById = new Map((usersResult.data || []).map((user: any) => [user.id, user]));
  const propertiesById = new Map((propertiesResult.data || []).map((property: any) => [property.id, property]));
  const plansById = new Map((plansResult.data || []).map((plan: any) => [plan.id, plan]));
  const metaByLead = (metaResult.data || []).reduce((acc: any, meta: any) => {
    if (!acc[meta.lead_id]) acc[meta.lead_id] = [];
    acc[meta.lead_id].push(meta);
    return acc;
  }, {});

  return leads.map(l => ({
    ...l,
    assignee: l.assignee || usersById.get(l.assigned_user_id) || null,
    interest_property: l.interest_property || propertiesById.get(l.interest_property_id) || null,
    interest_plan: l.interest_plan || plansById.get(l.interest_plan_id) || null,
    lead_meta: l.lead_meta || metaByLead[l.id] || [],
    tags: tagsByLead[l.id] || [],
    tasks_count: tasksByLead[l.id] || { pending: 0, completed: 0 }
  }));
}

export function useLeadMetaFilters(dateRange?: { from: Date; to: Date } | null) {
  const { organization } = useAuth();
  
  return useQuery({
    queryKey: ['lead-meta-filters', organization?.id, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      if (!organization?.id) return { campaigns: [], adsets: [], ads: [] };

      let query = supabase
        .from('lead_meta')
        .select(`
          campaign_name, campaign_id, 
          adset_name, adset_id, 
          ad_name, ad_id, 
          platform, 
          leads!inner(organization_id, created_at)
        `)
        .eq('leads.organization_id', organization.id);
      
      if (dateRange) {
        query = query
          .gte('leads.created_at', dateRange.from.toISOString())
          .lte('leads.created_at', dateRange.to.toISOString());
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      const uniqueCampaigns = new Map<string, { id: string, name: string }>();
      const uniqueAdSets = new Map<string, { id: string, name: string, campaignId: string }>();
      const uniqueAds = new Map<string, { id: string, name: string, adsetId: string, campaignId: string }>();

      (data || []).forEach((item: any) => {
        const campaignKey = item.campaign_id || item.campaign_name;
        if (campaignKey && item.campaign_name) {
          uniqueCampaigns.set(campaignKey, { 
            id: campaignKey, 
            name: item.campaign_name 
          });
        }
        
        const adsetKey = item.adset_id || item.adset_name;
        if (adsetKey && item.adset_name) {
          uniqueAdSets.set(`${campaignKey}-${adsetKey}`, { 
            id: adsetKey, 
            name: item.adset_name,
            campaignId: campaignKey
          });
        }
        
        const adKey = item.ad_id || item.ad_name;
        if (adKey && item.ad_name) {
          uniqueAds.set(`${campaignKey}-${adsetKey}-${adKey}`, { 
            id: adKey, 
            name: item.ad_name,
            adsetId: adsetKey,
            campaignId: campaignKey
          });
        }
      });
      
      const campaigns = Array.from(uniqueCampaigns.values())
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
      const adsets = Array.from(uniqueAdSets.values())
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      const ads = Array.from(uniqueAds.values())
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
      return { campaigns, adsets, ads };
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useFilteredStageCounts({
  pipelineId,
  stageIds,
  filterUser,
  filterTag,
  filterDealStatus,
  searchQuery,
  dateRange,
  filterCampaign,
  filterAdSet,
  filterAd,
  filterSource,
}: FilteredStageCountsParams) {
  return useQuery({
    queryKey: [
      'filtered-stage-counts',
      pipelineId,
      stageIds,
      filterUser,
      filterTag,
      filterDealStatus,
      searchQuery,
      dateRange?.from.toISOString(),
      dateRange?.to.toISOString(),
      filterCampaign,
      filterAdSet,
      filterAd,
      filterSource,
    ],
    enabled: !!pipelineId && stageIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      if (!pipelineId || stageIds.length === 0) return {} as Record<string, number>;

      try {
        const { isEmpty, apply } = await buildPipelineLeadQueryFilters({
          filterUserId: filterUser,
          filters: {
            dateRange,
            filterTag,
            filterDealStatus,
            searchQuery,
            filterCampaign,
            filterAdSet,
            filterAd,
            filterSource,
          },
        });

        if (isEmpty) {
          return Object.fromEntries(stageIds.map((stageId) => [stageId, 0]));
        }

        const counts = await Promise.all(
          stageIds.map(async (stageId) => {
            const query = apply(
              supabase
                .from('leads')
                .select('id', { count: 'exact', head: true })
                .eq('pipeline_id', pipelineId)
                .eq('stage_id', stageId)
            );
            const { count, error } = await query;
            if (error) throw error;
            return [stageId, count || 0] as const;
          })
        );

        return Object.fromEntries(counts);
      } catch (err) {
        console.error('[Pipeline filters] useFilteredStageCounts error:', err);
        return Object.fromEntries(stageIds.map((stageId) => [stageId, 0]));
      }
    },
  });
}

export function usePipelines() {
  return useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipelines')
        .select('id, name, is_default, created_at, organization_id')
        .order('created_at');
      
      if (error) throw error;
      return data;
    },
  });
}

export function useCreatePipeline() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ name, isDefault = false }: { name: string; isDefault?: boolean }) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Usuário não autenticado');
      
      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.user.id)
        .single();
      
      if (!userData?.organization_id) throw new Error('Organização não encontrada');
      
      const { data: pipeline, error: pipelineError } = await supabase
        .from('pipelines')
        .insert({
          name,
          organization_id: userData.organization_id,
          is_default: isDefault,
        })
        .select()
        .single();
      
      if (pipelineError) throw pipelineError;
      
      const { error: stagesError } = await (supabase as any).rpc('create_default_stages_for_pipeline', {
        p_pipeline_id: pipeline.id,
        p_org_id: userData.organization_id,
      });
      
      if (stagesError) {
        console.warn('Could not create default stages:', stagesError);
      }
      
      return pipeline;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      queryClient.invalidateQueries({ queryKey: ['stages'] });
      queryClient.invalidateQueries({ queryKey: ['stages-with-leads'] });
    },
  });
}

export function useUpdatePipeline() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, name, isDefault }: { id: string; name?: string; isDefault?: boolean }) => {
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (isDefault !== undefined) updates.is_default = isDefault;
      
      const { data, error } = await supabase
        .from('pipelines')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
    },
  });
}

export function useDeletePipeline() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: stageIds } = await supabase
        .from('stages')
        .select('id')
        .eq('pipeline_id', id);
      
      if (stageIds && stageIds.length > 0) {
        const { count } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .in('stage_id', stageIds.map(s => s.id));
        
        if (count && count > 0) {
          throw new Error(`Esta pipeline possui ${count} lead(s). Mova ou exclua os leads antes de deletar a pipeline.`);
        }
      }
      
      const { error } = await supabase
        .from('pipelines')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      queryClient.invalidateQueries({ queryKey: ['stages'] });
      queryClient.invalidateQueries({ queryKey: ['stages-with-leads'] });
    },
  });
}

export function useCreateStage() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ pipelineId, name, color }: { pipelineId: string; name: string; color?: string }) => {
      const { data: existingStages } = await supabase
        .from('stages')
        .select('position')
        .eq('pipeline_id', pipelineId)
        .order('position', { ascending: false })
        .limit(1);
      
      const nextPosition = (existingStages?.[0]?.position ?? -1) + 1;
      const stageKey = name.toLowerCase().replace(/\s+/g, '_').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      
      const { data, error } = await supabase
        .from('stages')
        .insert({
          pipeline_id: pipelineId,
          name,
          stage_key: stageKey,
          position: nextPosition,
          color: color || '#6b7280',
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stages'] });
      queryClient.invalidateQueries({ queryKey: ['stages-with-leads'] });
    },
  });
}

export function useLoadMoreLeads() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      pipelineId, 
      stageId, 
      offset,
      filterUserId,
      filters,
    }: { 
      pipelineId: string; 
      stageId: string; 
      offset: number;
      filterUserId?: string;
      filters?: {
        dateRange?: { from: Date; to: Date } | null;
        filterTag?: string;
        filterDealStatus?: string;
        searchQuery?: string;
        filterCampaign?: string;
        filterAdSet?: string;
        filterAd?: string;
        filterSource?: string;
      };
    }) => {
      try {
        const { isEmpty, apply } = await buildPipelineLeadQueryFilters({
          filterUserId,
          filters,
        });

        if (isEmpty) {
          return { stageId, leads: [] };
        }

        const query = apply(
          (supabase as any)
            .from('leads')
            .select(LEAD_PIPELINE_BASIC_FIELDS)
            .eq('pipeline_id', pipelineId)
            .eq('stage_id', stageId)
            .order('stage_entered_at', { ascending: false })
            .range(offset, offset + LEADS_PER_STAGE - 1)
        );

        const { data, error } = await query;
        if (error) throw error;
        const enrichedLeads = await getEnrichedLeadsBatch(data || []);
        return { stageId, leads: enrichedLeads };
      } catch (err) {
        console.error('[Pipeline filters] useLoadMoreLeads error:', err);
        return { stageId, leads: [] };
      }
    },
    onSuccess: ({ stageId, leads }, { pipelineId, filterUserId, filters }) => {
      const dateFromISO = filters?.dateRange?.from?.toISOString();
      const dateToISO = filters?.dateRange?.to?.toISOString();
      const cacheKey = ['stages-with-leads', pipelineId, filterUserId, dateFromISO, dateToISO, filters?.filterTag, filters?.filterDealStatus, filters?.searchQuery, filters?.filterCampaign, filters?.filterAdSet, filters?.filterAd, filters?.filterSource];
      
      queryClient.setQueryData(cacheKey, (old: any[] | undefined) => {
        if (!old) return old;
        return old.map(stage => {
          if (stage.id !== stageId) return stage;
          const existingIds = new Set((stage.leads || []).map((l: any) => l.id));
          const newLeads = leads.filter((l: any) => !existingIds.has(l.id));
          return {
            ...stage,
            leads: [...(stage.leads || []), ...newLeads],
            has_more: stage.total_lead_count > (stage.leads?.length || 0) + newLeads.length,
          };
        });
      });
    },
  });
}
