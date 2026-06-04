import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface UserPermissions {
  permissions: string[];
  isLoading: boolean;
  hasPermission: (key: string) => boolean;
}

/**
 * Hook to fetch all permissions for the current user.
 * Returns a helper function to check if user has a specific permission.
 * Admins and super admins always have all permissions.
 */
export function useUserPermissions(): UserPermissions {
  const { profile, isSuperAdmin } = useAuth();

  const { data: permissions = [], isLoading } = useQuery({
    queryKey: ['user-permissions', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];

      // Admin and super admin have all permissions
      if (profile.role === 'admin' || profile.role === 'super_admin') {
        return ['*']; // Wildcard means all permissions
      }

      // Fetch user's role and its permissions
      const { data, error } = await supabase.rpc('get_user_organization_role', {
        p_user_id: profile.id,
      });

      if (error) {
        console.error('Error fetching user permissions:', error);
        return [];
      }

      if (!data || data.length === 0) {
        return [];
      }

      // Return all permissions from the user's role
      return data[0]?.permissions?.filter(Boolean) || [];
    },
    enabled: !!profile?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const hasPermission = (key: string): boolean => {
    // Super admin always has permission
    if (isSuperAdmin) return true;
    
    // Admin always has permission
    if (profile?.role === 'admin') return true;
    
    // Still loading - return false to prevent unauthorized access
    // This is safer than returning true during load
    if (isLoading) return false;
    
    // Wildcard means all permissions
    if (permissions.includes('*')) return true;
    
    return permissions.includes(key);
  };

  return {
    permissions,
    isLoading,
    hasPermission,
  };
}
