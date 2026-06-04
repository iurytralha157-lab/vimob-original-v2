import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface OrganizationRole {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  color: string;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AvailablePermission {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: 'modules' | 'leads' | 'data' | 'settings';
}

export interface RolePermission {
  id: string;
  organization_role_id: string;
  permission_key: string;
}

export interface UserOrganizationRole {
  id: string;
  user_id: string;
  organization_role_id: string;
  created_at: string;
}

// Hook para buscar funções da organização
export function useOrganizationRoles() {
  const { organization } = useAuth();

  return useQuery({
    queryKey: ['organization-roles', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const { data, error } = await supabase
        .from('organization_roles')
        .select('*')
        .eq('organization_id', organization.id)
        .eq('is_active', true)
        .order('name');

      if (error) {
        console.error('Error fetching organization roles:', error);
        throw error;
      }

      return data as OrganizationRole[];
    },
    enabled: !!organization?.id,
  });
}

// Hook para buscar todas as permissões disponíveis
export function useAvailablePermissions() {
  return useQuery({
    queryKey: ['available-permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('available_permissions')
        .select('*')
        .order('category', { ascending: true });

      if (error) {
        console.error('Error fetching available permissions:', error);
        throw error;
      }

      return data as AvailablePermission[];
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}

// Hook para buscar permissões de uma função específica
export function useRolePermissions(roleId: string | null) {
  return useQuery({
    queryKey: ['role-permissions', roleId],
    queryFn: async () => {
      if (!roleId) return [];

      const { data, error } = await supabase
        .from('organization_role_permissions')
        .select('*')
        .eq('organization_role_id', roleId);

      if (error) {
        console.error('Error fetching role permissions:', error);
        throw error;
      }

      return data as RolePermission[];
    },
    enabled: !!roleId,
  });
}

// Hook para buscar atribuições de função aos usuários
export function useUserOrganizationRoles() {
  const { organization } = useAuth();

  return useQuery({
    queryKey: ['user-organization-roles', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      // Primeiro pegar todas as funções da organização
      const { data: roles, error: rolesError } = await supabase
        .from('organization_roles')
        .select('id')
        .eq('organization_id', organization.id);

      if (rolesError) throw rolesError;
      if (!roles?.length) return [];

      const roleIds = roles.map(r => r.id);

      const { data, error } = await supabase
        .from('user_organization_roles')
        .select('*')
        .in('organization_role_id', roleIds);

      if (error) {
        console.error('Error fetching user organization roles:', error);
        throw error;
      }

      return data as UserOrganizationRole[];
    },
    enabled: !!organization?.id,
  });
}

// Hook para criar uma nova função
export function useCreateRole() {
  const queryClient = useQueryClient();
  const { organization } = useAuth();

  return useMutation({
    mutationFn: async (data: { 
      name: string; 
      description?: string; 
      color?: string;
      permissions?: string[];
    }) => {
      if (!organization?.id) throw new Error('Organização não encontrada');

      // Criar a função
      const { data: role, error: roleError } = await supabase
        .from('organization_roles')
        .insert({
          organization_id: organization.id,
          name: data.name,
          description: data.description || null,
          color: data.color || '#6B7280',
        })
        .select()
        .single();

      if (roleError) throw roleError;

      // Se tiver permissões, adicionar
      if (data.permissions?.length) {
        const permissionsToInsert = data.permissions.map(key => ({
          organization_role_id: role.id,
          permission_key: key,
        }));

        const { error: permsError } = await supabase
          .from('organization_role_permissions')
          .insert(permissionsToInsert);

        if (permsError) throw permsError;
      }

      return role;
    },
    onSuccess: () => {
      toast.success('Função criada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['organization-roles'] });
    },
    onError: (error: any) => {
      if (error.code === '23505') {
        toast.error('Já existe uma função com esse nome');
      } else {
        toast.error('Erro ao criar função: ' + error.message);
      }
    },
  });
}

// Hook para atualizar uma função
export function useUpdateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { 
      id: string;
      name?: string; 
      description?: string; 
      color?: string;
      is_active?: boolean;
    }) => {
      const { id, ...updates } = data;

      const { data: role, error } = await supabase
        .from('organization_roles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return role;
    },
    onSuccess: () => {
      toast.success('Função atualizada!');
      queryClient.invalidateQueries({ queryKey: ['organization-roles'] });
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar função: ' + error.message);
    },
  });
}

// Hook para excluir uma função
export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase
        .from('organization_roles')
        .delete()
        .eq('id', roleId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Função excluída!');
      queryClient.invalidateQueries({ queryKey: ['organization-roles'] });
      queryClient.invalidateQueries({ queryKey: ['user-organization-roles'] });
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir função: ' + error.message);
    },
  });
}

// Hook para atualizar permissões de uma função
export function useUpdateRolePermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { 
      roleId: string;
      permissions: string[];
    }) => {
      // Remover todas as permissões atuais
      const { error: deleteError } = await supabase
        .from('organization_role_permissions')
        .delete()
        .eq('organization_role_id', data.roleId);

      if (deleteError) throw deleteError;

      // Adicionar novas permissões
      if (data.permissions.length > 0) {
        const permissionsToInsert = data.permissions.map(key => ({
          organization_role_id: data.roleId,
          permission_key: key,
        }));

        const { error: insertError } = await supabase
          .from('organization_role_permissions')
          .insert(permissionsToInsert);

        if (insertError) throw insertError;
      }
    },
    onSuccess: (_, variables) => {
      toast.success('Permissões atualizadas!');
      queryClient.invalidateQueries({ queryKey: ['role-permissions', variables.roleId] });
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar permissões: ' + error.message);
    },
  });
}

// Hook para atribuir função a um usuário
export function useAssignUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { 
      userId: string;
      roleId: string | null; // null para remover função
    }) => {
      // Primeiro remover função atual do usuário
      const { error: deleteError } = await supabase
        .from('user_organization_roles')
        .delete()
        .eq('user_id', data.userId);

      if (deleteError) throw deleteError;

      // Se tiver nova função, atribuir
      if (data.roleId) {
        const { error: insertError } = await supabase
          .from('user_organization_roles')
          .insert({
            user_id: data.userId,
            organization_role_id: data.roleId,
          });

        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      toast.success('Função do usuário atualizada!');
      queryClient.invalidateQueries({ queryKey: ['user-organization-roles'] });
      queryClient.invalidateQueries({ queryKey: ['organization-users'] });
    },
    onError: (error: any) => {
      toast.error('Erro ao atribuir função: ' + error.message);
    },
  });
}

// Hook para verificar se o usuário atual tem uma permissão específica
export function useHasPermission(permissionKey: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['has-permission', profile?.id, permissionKey],
    queryFn: async () => {
      if (!profile?.id) return false;

      // Admin sempre tem todas as permissões
      if (profile.role === 'admin' || profile.role === 'super_admin') {
        return true;
      }

      // Verificar via função do banco
      const { data, error } = await supabase
        .rpc('user_has_permission', { 
          p_permission_key: permissionKey,
          p_user_id: profile.id 
        });

      if (error) {
        console.error('Error checking permission:', error);
        return false;
      }

      return data as boolean;
    },
    enabled: !!profile?.id,
  });
}
