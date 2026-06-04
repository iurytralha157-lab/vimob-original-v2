import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getFriendlyErrorMessage } from '@/lib/error-handler';

export interface AdminInvitation {
  id: string;
  email: string | null;
  role: string | null;
  token: string;
  organization_id: string;
  expires_at: string;
  used_at: string | null;
  created_at: string | null;
  created_by: string | null;
}

export function useAdminInvitations(organizationId: string | undefined) {
  const queryClient = useQueryClient();

  // Fetch invitations for a specific organization
  const { data: invitations, isLoading } = useQuery({
    queryKey: ['admin-invitations', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('organization_id', organizationId)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(inv => ({
        ...inv,
        role: (inv as any).role || 'user'
      })) as AdminInvitation[];
    },
    enabled: !!organizationId,
  });

  // Create invitation
  const createInvitation = useMutation({
    mutationFn: async (data: { 
      email: string; 
      role: 'admin' | 'user';
      organizationId: string;
    }) => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

      const { data: invitation, error } = await supabase
        .from('invitations')
        .insert({
          email: data.email,
          role: data.role,
          organization_id: data.organizationId,
          expires_at: expiresAt.toISOString(),
        } as any)
        .select()
        .single();

      if (error) throw error;
      return invitation;
    },
    onSuccess: () => {
      toast.success('Convite criado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['admin-invitations', organizationId] });
    },
    onError: (error: any) => {
      toast.error('Erro ao criar convite: ' + getFriendlyErrorMessage(error));
    },
  });

  // Delete invitation
  const deleteInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await supabase
        .from('invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Convite removido!');
      queryClient.invalidateQueries({ queryKey: ['admin-invitations', organizationId] });
    },
    onError: (error: any) => {
      toast.error('Erro ao remover convite: ' + getFriendlyErrorMessage(error));
    },
  });

  const getInviteLink = (token: string) => {
    return `${window.location.origin}/auth?invite=${token}`;
  };

  return {
    invitations,
    isLoading,
    createInvitation,
    deleteInvitation,
    getInviteLink,
  };
}
