import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LeadMessage {
  id: string;
  content: string | null;
  from_me: boolean;
  message_type: string | null;
  media_url: string | null;
  media_mime_type: string | null;
  media_status: string | null;
  media_error: string | null;
  media_size: number | null;
  sent_at: string;
  status: string | null;
  sender_name: string | null;
  sender_jid: string | null;
  conversation_id: string;
  session_id: string;
  // Joined data
  session_owner_name?: string | null;
  session_instance_name?: string | null;
}

export function useLeadMessages(leadId: string | null | undefined) {
  return useQuery({
    queryKey: ['lead-messages', leadId],
    queryFn: async (): Promise<LeadMessage[]> => {
      if (!leadId) return [];

      // Use edge function with SERVICE_ROLE to bypass RLS on whatsapp tables
      const { data, error } = await supabase.functions.invoke('whatsapp-history-access', {
        body: { leadId, allMessages: true },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data?.messages || [];
    },
    enabled: !!leadId,
    staleTime: 30_000,
  });
}
