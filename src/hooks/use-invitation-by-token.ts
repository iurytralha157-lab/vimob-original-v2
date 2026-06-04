import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Interface para o retorno da RPC get_invitation_by_token
interface InvitationByToken {
  id: string;
  email: string | null;
  role: 'admin' | 'user';
  organization_id: string;
  expires_at: string;
}

/**
 * Hook seguro para buscar convite por token usando RPC
 * Evita enumeration de convites via SELECT direto
 */
export function useInvitationByToken(token: string | null) {
  return useQuery({
    queryKey: ['invitation-by-token', token],
    queryFn: async (): Promise<InvitationByToken | null> => {
      if (!token) return null;
      
      // Query directly from invitations table
      const { data, error } = await supabase
        .from('invitations')
        .select('id, email, role, organization_id, expires_at')
        .eq('token', token)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching invitation:', error);
        return null;
      }
      
      return data as InvitationByToken | null;
    },
    enabled: !!token,
    staleTime: 1000 * 60 * 5, // 5 minutos
    retry: false, // Não retentar se falhar (pode ser token inválido)
  });
}
