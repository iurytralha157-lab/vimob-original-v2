import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SiteSearchFilter } from './use-site-search-filters';

export function usePublicSearchFilters(organizationId: string | null) {
  return useQuery({
    queryKey: ['public-search-filters', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_search_filters' as any)
        .select('*')
        .eq('organization_id', organizationId!)
        .eq('is_active', true)
        .order('position');

      if (error) throw error;
      return (data || []) as unknown as SiteSearchFilter[];
    },
    enabled: !!organizationId,
  });
}

// Default filters when none configured
export const DEFAULT_SEARCH_FILTERS = [
  { filter_key: 'search', label: 'Buscar', position: 0 },
  { filter_key: 'tipo', label: 'Tipo de Imóvel', position: 1 },
  { filter_key: 'finalidade', label: 'Finalidade', position: 2 },
];
