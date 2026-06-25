import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Tables } from '@/integrations/supabase/types';
import { logAuditAction } from './use-audit-logs';
import { useAuth } from '@/contexts/AuthContext';

export type User = Tables<'users'>;
export type OrganizationUser = User & {
  organization_member_id?: string;
  organization_member_is_active?: boolean;
};

async function getEdgeFunctionErrorMessage(error: unknown, fallback: string) {
  const context = (error as { context?: Response })?.context;

  if (context && typeof context.json === 'function') {
    try {
      const body = await context.clone().json();
      if (typeof body?.error === 'string') return body.error;
      if (typeof body?.message === 'string') return body.message;
    } catch {
      // Keep the SDK error when the response body is not JSON.
    }
  }

  return error instanceof Error ? error.message : fallback;
}

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
        .order('name');

      if (error) throw error;

      const { data: memberships } = await supabase
        .from('organization_members' as any)
        .select('id, user_id, role, is_active, organization_id')
        .eq('organization_id', organizationId);

      const membershipByUserId = new Map(
        (memberships || []).map((member: any) => [member.user_id, member])
      );

      return (users || [])
        .filter((user) => user.organization_id === organizationId || membershipByUserId.has(user.id))
        .map((user) => {
          const membership = membershipByUserId.get(user.id);
          if (!membership) return user as OrganizationUser;

          return {
            ...user,
            organization_id: organizationId,
            role: membership.role || user.role,
            is_active: (user.is_active !== false) && (membership.is_active !== false),
            organization_member_id: membership.id,
            organization_member_is_active: membership.is_active,
          } as OrganizationUser;
        })
        .sort((a, b) => {
          if ((a.is_active !== false) !== (b.is_active !== false)) {
            return a.is_active === false ? 1 : -1;
          }
          return a.name.localeCompare(b.name);
        });
    },
  });
}

// Alias for backward compatibility
export const useUsers = useOrganizationUsers;

export function useUpdateUser() {
  const queryClient = useQueryClient();
  const { organization, profile } = useAuth();
  const organizationId = organization?.id || profile?.organization_id || null;

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<User> & { id: string }) => {
      const { data, error } = await supabase.functions.invoke('update-organization-user', {
        body: { userId: id, organizationId, updates },
      });

      if (error) {
        throw new Error(await getEdgeFunctionErrorMessage(error, 'Erro ao atualizar usuario'));
      }
      if (!data?.success) throw new Error(data?.error || 'Erro ao atualizar usuario');

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
      toast.success('Usuario atualizado!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar usuario: ' + error.message);
    },
  });
}
