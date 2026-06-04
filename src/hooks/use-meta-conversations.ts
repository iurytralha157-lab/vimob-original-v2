import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface MetaConversation {
  id: string;
  organization_id: string;
  lead_id: string | null;
  external_id: string;
  platform: 'instagram' | 'messenger';
  contact_name: string | null;
  contact_picture: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  lead?: {
    id: string;
    name: string;
  };
}

export interface MetaMessage {
  id: string;
  conversation_id: string;
  external_id: string;
  content: string | null;
  message_type: string;
  from_me: boolean;
  status: string | null;
  media_url: string | null;
  media_mime_type: string | null;
  sent_at: string;
  created_at: string;
}

export function useMetaConversations(pageId?: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["meta-conversations", pageId],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      
      try {
        let query = (supabase as any)
          .from("meta_conversations")
          .select(`
            *,
            lead:leads(id, name)
          `)
          .eq("organization_id", profile.organization_id);

        if (pageId && pageId !== 'all') {
          query = query.eq("page_id", pageId);
        }

        const { data, error } = await query.order("last_message_at", { ascending: false });

        if (error) {
          if (error.code === 'PGRST116' || error.message.includes('relation "meta_conversations" does not exist')) {
            console.warn("Meta conversations table does not exist yet.");
            return [];
          }
          throw error;
        }
        return data as MetaConversation[];
      } catch (e) {
        console.error("Error fetching meta conversations:", e);
        return [];
      }
    },
    enabled: !!profile?.organization_id,
  });
}

export function useMetaMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["meta-messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await (supabase as any)
        .from("meta_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("sent_at", { ascending: true });

      if (error) {
        if (error.message.includes('relation "meta_messages" does not exist')) {
          return [];
        }
        throw error;
      }
      return data as MetaMessage[];
    },
    enabled: !!conversationId,
  });
}

export function useSendMetaMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      conversationId, 
      text, 
      platform, 
      recipientExternalId 
    }: { 
      conversationId: string; 
      text: string; 
      platform: 'instagram' | 'messenger';
      recipientExternalId: string;
    }) => {
      // For now, this is a placeholder for the edge function call
      const { data, error } = await supabase.functions.invoke("meta-messenger-proxy", {
        body: {
          action: "sendMessage",
          platform,
          recipientId: recipientExternalId,
          text,
          conversationId
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["meta-messages", variables.conversationId] });
    }
  });
}
