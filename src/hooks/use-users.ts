import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Tables } from '@/integrations/supabase/types';
import { logAuditAction } from './use-audit-logs';
import { useAuth } from '@/contexts/AuthContext';
export type User = Tables<'users'>;

export function useOrganizationUsers() {
  const { organization, profile } = useAuth();
  const organizationId = organization?.id || profile?.organization_id || null;

  return useQuery({
    queryKey: ['organization-users', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;

      const { data: memberships } = await supabase
        .from('organization_members' as any)
        .select('user_id, role, is_active, organization_id')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      const membershipByUserId = new Map(
        (memberships || []).map((member: any) => [member.user_id, member])
      );

      return (users || [])
        .filter((user) => user.organization_id === organizationId || membershipByUserId.has(user.id))
        .map((user) => {
          const membership = membershipByUserId.get(user.id);
          if (!membership) return user as User;

          return {
            ...user,
            organization_id: organizationId,
            role: membership.role || user.role,
            is_active: membership.is_active ?? user.is_active,
          } as User;
        });
    },
  });
}

// Alias for backward compatibility
export const useUsers = useOrganizationUsers;

export function useUpdateUser() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<User> & { id: string }) => {
      const { data, error } = await supabase.functions.invoke('update-organization-user', {
        body: { userId: id, updates },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao atualizar usuário');

      logAuditAction(
        'update',
        'user',
        id,
        undefined,
        updates as Record<string, unknown>,
        data.user?.organization_id || undefined
      ).catch(console.error);

      return data.user as User;
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueriesData({ queryKey: ['organization-users'] }, (current: User[] | undefined) => {
        if (!Array.isArray(current)) return current;
        return current.map(user => user.id === updatedUser.id ? { ...user, ...updatedUser } : user);
      });
      queryClient.invalidateQueries({ queryKey: ['organization-users'] });
      toast.success('Usuário atualizado!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar usuário: ' + error.message);
    },
  });
}
