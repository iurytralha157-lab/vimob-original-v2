import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type ModuleName = 
  | 'crm' 
  | 'financial' 
  | 'properties' 
  | 'plans'        // Telecom: Planos de Serviço
  | 'coverage'     // Telecom: Áreas de Cobertura
  | 'telecom'      // Telecom: Clientes
  | 'whatsapp' 
  | 'agenda' 
  | 'cadences'
  | 'tags'
  | 'round_robin'
  | 'reports'
  | 'automations'  // Automações
  | 'performance'  // Performance de Corretores
  | 'gamification'   // Gamificação
  | 'webhooks'     // Webhooks
  | 'site'         // Site Integrado
  | 'ai_agent'    // Agente de IA
  | 'campaigns'   // Campanhas (Dashboard Meta)
  | 'engineering' // Engenharia e Obras
  | 'api';         // API Pública

// Default modules that are enabled if no explicit record exists
export const DEFAULT_ENABLED_MODULES: ModuleName[] = [
  'crm',
  'properties',
  'whatsapp',
  'agenda',
  'cadences',
  'tags',
  'round_robin',
  'reports'
];

export function useOrganizationModules() {
  const { organization, profile, isSuperAdmin, loading: authLoading } = useAuth();
  const orgId = organization?.id || profile?.organization_id;

  const { data: modules, isLoading: modulesLoading } = useQuery({
    queryKey: ['organization-modules', orgId],
    queryFn: async () => {
      if (!orgId) return [];

      const { data, error } = await supabase
        .from('organization_modules')
        .select('*')
        .eq('organization_id', orgId);

      if (error) {
        console.error('Error fetching organization modules:', error);
        return [];
      }

      return data || [];
    },
    enabled: !!orgId,
  });

  // Consider loading if auth is still loading OR if we have an org but modules aren't loaded yet
  const isLoading = authLoading || (!!orgId && modulesLoading);

  // Check if a specific module is enabled
  const hasModule = (moduleName: ModuleName): boolean => {
    // Super admins need to enable modules explicitly to see them as a regular user would,
    // but we can keep the logic flexible. Based on user request, we want them disabled by default.
    // if (isSuperAdmin && orgId) return true;

    
    // If still loading, only return true for default enabled modules to prevent flash
    if (isLoading) return DEFAULT_ENABLED_MODULES.includes(moduleName);
    
    // If no organization, no modules available
    if (!orgId) return false;
    
    // Find the module in the list
    const moduleRecord = modules?.find(m => m.module_name === moduleName);
    
    // If found in list, use its value
    if (moduleRecord) {
      return moduleRecord.is_enabled;
    }

    // If not found in list, check defaults
    return DEFAULT_ENABLED_MODULES.includes(moduleName);
  };

  // Get list of all enabled modules
  const enabledModules = (): ModuleName[] => {
    if (!orgId) return [];

    // Start with default list
    let list = [...DEFAULT_ENABLED_MODULES];

    // Apply database settings
    if (modules && modules.length > 0) {
      modules.forEach(m => {
        const name = m.module_name as ModuleName;
        if (m.is_enabled) {
          if (!list.includes(name)) list.push(name);
        } else {
          list = list.filter(item => item !== name);
        }
      });
    }

    return list;
  };

  return {
    modules,
    isLoading,
    hasModule,
    enabledModules,
  };
}
