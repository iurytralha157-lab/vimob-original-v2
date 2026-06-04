import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Invitation {
  id: string;
  organization_id: string;
  email: string | null;
  token: string;
  role: 'admin' | 'user';
  created_by: string | null;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export function useInvitations() {
  return useQuery({
    queryKey: ['invitations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Invitation[];
    },
  });
}

export function useCreateInvitation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ email, role }: { email?: string; role: 'admin' | 'user' }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Não autenticado');
      
      const { data: profile } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', userData.user.id)
        .single();
      
      if (!profile?.organization_id) throw new Error('Organização não encontrada');
      
      const { data, error } = await supabase
        .from('invitations')
        .insert({
          organization_id: profile.organization_id,
          email: email || null,
          role,
          created_by: userData.user.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as Invitation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      toast.success('Convite criado!');
    },
    onError: (error) => {
      toast.error('Erro ao criar convite: ' + error.message);
    },
  });
}

export function useDeleteInvitation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('invitations')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      toast.success('Convite cancelado!');
    },
    onError: (error) => {
      toast.error('Erro ao cancelar convite: ' + error.message);
    },
  });
}

export function getInviteLink(token: string) {
  return `${window.location.origin}/auth?invite=${token}`;
}
