import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SiteMenuItem } from './use-site-menu';

export function usePublicSiteMenu(organizationId: string | null) {
  return useQuery({
    queryKey: ['public-site-menu', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_menu_items' as any)
        .select('*')
        .eq('organization_id', organizationId!)
        .eq('is_active', true)
        .order('position');
      
      if (error) throw error;
      return (data || []) as unknown as SiteMenuItem[];
    },
    enabled: !!organizationId,
  });
}
