import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface FeatureRequest {
  id: string;
  organization_id: string;
  user_id: string | null;
  category: string;
  title: string;
  description: string;
  status: 'pending' | 'analyzing' | 'approved' | 'rejected';
  admin_response: string | null;
  responded_at: string | null;
  responded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateFeatureRequestInput {
  category: string;
  title: string;
  description: string;
}

export interface UpdateFeatureRequestInput {
  id: string;
  status: FeatureRequest['status'];
  admin_response?: string;
}

// Hook for users to view their own requests
export function useMyFeatureRequests() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['my-feature-requests', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_requests')
        .select('*')
        .eq('user_id', profile?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as FeatureRequest[];
    },
    enabled: !!profile?.id,
  });
}

// Hook for super admins to view all requests
export function useAllFeatureRequests() {
  const { isSuperAdmin } = useAuth();

  return useQuery({
    queryKey: ['all-feature-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_requests')
        .select(`
          *,
          user:users!feature_requests_user_id_fkey(id, name, email),
          organization:organizations!feature_requests_organization_id_fkey(id, name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as (FeatureRequest & {
        user: { id: string; name: string; email: string } | null;
        organization: { id: string; name: string } | null;
      })[];
    },
    enabled: isSuperAdmin,
  });
}

// Hook to create a feature request
export function useCreateFeatureRequest() {
  const queryClient = useQueryClient();
  const { profile, organization } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateFeatureRequestInput) => {
      if (!profile?.id || !organization?.id) {
        throw new Error('Usuário não autenticado');
      }

      const { data, error } = await supabase
        .from('feature_requests')
        .insert({
          organization_id: organization.id,
          user_id: profile.id,
          category: input.category,
          title: input.title,
          description: input.description,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-feature-requests'] });
      toast({
        title: 'Solicitação enviada!',
        description: 'Sua sugestão foi recebida e será analisada em até 15-30 dias.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao enviar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Hook for super admin to respond to requests
export function useRespondFeatureRequest() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: UpdateFeatureRequestInput) => {
      const { data, error } = await supabase
        .from('feature_requests')
        .update({
          status: input.status,
          admin_response: input.admin_response,
          responded_at: new Date().toISOString(),
          responded_by: profile?.id,
        })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-feature-requests'] });
      toast({
        title: 'Resposta enviada!',
        description: 'O usuário será notificado sobre o status da solicitação.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao responder',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
