import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { getFriendlyErrorMessage } from '@/lib/error-handler';
import { logAuditAction } from './use-audit-logs';

export interface OrganizationWithStats {
  id: string;
  name: string;
  logo_url: string | null;
  is_active: boolean;
  subscription_status: string;
  max_users: number;
  admin_notes: string | null;
  created_at: string;
  last_access_at: string | null;
  user_count?: number;
  lead_count?: number;
  plan_id?: string | null;
  subscription_value?: number | null;
  billing_day?: number | null;
  next_billing_date?: string | null;
  asaas_customer_id?: string | null;
  asaas_subscription_id?: string | null;
  segment?: string | null;
  creci?: string | null;
  max_whatsapp_sessions_override?: number | null;
}

export function useSuperAdmin() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  // Only enable queries when auth is not loading and user is super admin
  const isReady = !authLoading && isSuperAdmin === true;

  // Fetch all organizations with stats using RPC that bypasses RLS
  const { data: organizations, isLoading: loadingOrgs } = useQuery({
    queryKey: ['super-admin-organizations'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_all_organizations_admin');

      if (error) throw error;

      return (data || []) as OrganizationWithStats[];
    },
    enabled: isReady,
  });

  // Fetch all users across organizations using RPC that bypasses RLS
  const { data: allUsers, isLoading: loadingUsers } = useQuery({
    queryKey: ['super-admin-users'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_all_users_admin');

      if (error) throw error;
      return data || [];
    },
    enabled: isReady,
  });

  // Create new organization with admin user via edge function
  const createOrganization = useMutation({
    mutationFn: async (data: { 
      name: string; 
      segment?: 'imobiliario' | 'telecom' | 'servicos' | 'engenharia';
      adminEmail: string; 
      adminName: string; 
      adminPassword: string;
      whatsapp?: string;
      phone?: string;
      cnpj?: string;
      creci?: string;
      planId?: string | null;
      address?: string;
      city?: string;
      neighborhood?: string;
      number?: string;
      complement?: string;
      cpf?: string;
    }) => {
      const { data: result, error } = await supabase.functions.invoke('create-organization-admin', {
        body: data,
      });

      if (error) {
        throw new Error(error.message || 'Erro ao criar organização');
      }

      if (result?.error) {
        throw new Error(result.error);
      }

      return result;
    },
    onSuccess: (data, variables) => {
      toast.success(`Organização "${data.organization.name}" criada com sucesso!`);
      
      // Audit log: organization created
      logAuditAction(
        'create',
        'organization',
        data.organization.id,
        undefined,
        { name: variables.name, admin_email: variables.adminEmail, segment: variables.segment }
      ).catch(console.error);
      
      queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin-users'] });
    },
    onError: (error: any) => {
      toast.error('Erro ao criar organização: ' + getFriendlyErrorMessage(error));
    },
  });

  // Update organization
  const updateOrganization = useMutation({
    mutationFn: async (data: { 
      id: string; 
      name?: string;
      is_active?: boolean;
      subscription_status?: string;
      max_users?: number;
      admin_notes?: string;
      plan_id?: string | null;
      subscription_value?: number | null;
      billing_day?: number | null;
      next_billing_date?: string | null;
      creci?: string | null;
      max_whatsapp_sessions_override?: number | null;
    }) => {
      const { id, ...updates } = data;
      
      // Fetch old data for audit log
      const { data: oldOrg } = await supabase
        .from('organizations')
        .select('name, is_active, subscription_status, max_users')
        .eq('id', id)
        .single();
      
      const { error } = await supabase
        .from('organizations')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      
      // Audit log: organization updated
      logAuditAction(
        'update',
        'organization',
        id,
        oldOrg || undefined,
        updates
      ).catch(console.error);
    },
    onSuccess: (_, variables) => {
      toast.success('Organização atualizada!');
      queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
      if (variables.id) {
        queryClient.invalidateQueries({ queryKey: ['org-details', variables.id] });
      }
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar: ' + getFriendlyErrorMessage(error));
    },
  });

  // Delete organization via edge function (bypasses RLS)
  const deleteOrganization = useMutation({
    mutationFn: async (organizationId: string) => {
      // Fetch org name for audit log before deletion
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', organizationId)
        .single();
      
      const { data: result, error } = await supabase.functions.invoke('delete-organization', {
        body: { organizationId },
      });

      if (error) {
        throw new Error(error.message || 'Erro ao excluir organização');
      }

      if (result?.error) {
        throw new Error(result.error);
      }

      // Audit log: organization deleted
      logAuditAction(
        'delete',
        'organization',
        organizationId,
        { name: org?.name }
      ).catch(console.error);

      return result;
    },
    onSuccess: () => {
      toast.success('Organização excluída com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin-users'] });
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir organização: ' + getFriendlyErrorMessage(error));
    },
  });

  // Update module access for an organization
  const updateModuleAccess = useMutation({
    mutationFn: async (data: { 
      organizationId: string; 
      moduleName: string; 
      isEnabled: boolean;
    }) => {
      // Check if module record exists
      const { data: existing } = await supabase
        .from('organization_modules')
        .select('id')
        .eq('organization_id', data.organizationId)
        .eq('module_name', data.moduleName)
        .single();

      if (existing) {
        // Update
        const { error } = await supabase
          .from('organization_modules')
          .update({ is_enabled: data.isEnabled })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase
          .from('organization_modules')
          .insert({
            organization_id: data.organizationId,
            module_name: data.moduleName,
            is_enabled: data.isEnabled,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Acesso ao módulo atualizado!');
      queryClient.invalidateQueries({ queryKey: ['organization-modules'] });
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar módulo: ' + getFriendlyErrorMessage(error));
    },
  });

  // Update user (activate/deactivate)
  const updateUser = useMutation({
    mutationFn: async (data: { 
      userId: string; 
      is_active?: boolean;
      organization_id?: string | null;
    }) => {
      const { userId, ...updates } = data;
      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId);

      if (error) throw error;
      
      // Audit log: user updated by super admin
      logAuditAction(
        'update',
        'user',
        userId,
        undefined,
        updates
      ).catch(console.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-users'] });
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar usuário: ' + getFriendlyErrorMessage(error));
    },
  });

  // Delete user via edge function
  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const { data: result, error } = await supabase.functions.invoke('manage-user', {
        body: { action: 'delete', userId },
      });

      if (error) {
        throw error;
      }

      if (result?.error) {
        throw new Error(result.error);
      }
      
      // Audit log: user deleted by super admin
      logAuditAction(
        'delete',
        'user',
        userId
      ).catch(console.error);

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-users'] });
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir usuário: ' + getFriendlyErrorMessage(error));
    },
  });

  // Get stats
  const stats = {
    totalOrganizations: organizations?.length || 0,
    activeOrganizations: organizations?.filter(o => o.is_active).length || 0,
    trialOrganizations: organizations?.filter(o => o.subscription_status === 'trial').length || 0,
    suspendedOrganizations: organizations?.filter(o => o.subscription_status === 'suspended').length || 0,
    totalUsers: allUsers?.length || 0,
  };

  return {
    organizations,
    allUsers,
    loadingOrgs,
    loadingUsers,
    stats,
    createOrganization,
    updateOrganization,
    updateModuleAccess,
    deleteOrganization,
    updateUser,
    deleteUser,
  };
}
