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
  media_storage_path: string | null;
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

const WHATSAPP_MEDIA_SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;

async function hydrateLeadMessageMediaUrls(messages: LeadMessage[]): Promise<LeadMessage[]> {
  const messagesWithStoragePath = messages.filter((message) => message.media_storage_path);
  if (messagesWithStoragePath.length === 0) return messages;

  const uniquePaths = [
    ...new Set(messagesWithStoragePath.map((message) => message.media_storage_path!).filter(Boolean)),
  ];

  // Nao remova esta assinatura por storage_path: audios/imagens antigas dependem dela para continuar renderizando.
  // URLs salvas em media_url podem expirar ou apontar para origem externa temporaria.
  const { data, error } = await supabase.storage
    .from("whatsapp-media")
    .createSignedUrls(uniquePaths, WHATSAPP_MEDIA_SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    console.error("Error creating signed lead media URLs:", error);
    return messages;
  }

  const signedByPath = new Map<string, string>();
  data.forEach((item, index) => {
    if (item.signedUrl) signedByPath.set(uniquePaths[index], item.signedUrl);
  });

  return messages.map((message) => {
    if (!message.media_storage_path) return message;
    const signedUrl = signedByPath.get(message.media_storage_path);
    return signedUrl ? { ...message, media_url: signedUrl } : message;
  });
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

      return hydrateLeadMessageMediaUrls(data?.messages || []);
    },
    enabled: !!leadId,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
