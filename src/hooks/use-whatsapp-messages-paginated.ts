import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback } from "react";
import type { WhatsAppMessage } from "./use-whatsapp-conversations";

const WHATSAPP_MEDIA_SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;

interface PaginatedMessagesResult {
  messages: WhatsAppMessage[];
  nextCursor: string | null;
}

async function hydrateMessageMediaUrls(messages: WhatsAppMessage[]): Promise<WhatsAppMessage[]> {
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
    console.error("Error creating signed WhatsApp media URLs:", error);
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

export function useWhatsAppMessagesPaginated(
  conversationId: string | null,
  options?: { pageSize?: number }
) {
  const queryClient = useQueryClient();
  const pageSize = options?.pageSize || 30;

  const query = useInfiniteQuery({
    queryKey: ["whatsapp-messages-paginated", conversationId],
    queryFn: async ({ pageParam }): Promise<PaginatedMessagesResult> => {
      if (!conversationId) {
        return { messages: [], nextCursor: null };
      }

      let queryBuilder = supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("sent_at", { ascending: false })
        .limit(pageSize);

      // If we have a cursor, fetch messages older than that timestamp
      if (pageParam) {
        queryBuilder = queryBuilder.lt("sent_at", pageParam);
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;

      const messages = data || [];
      
      // Reverse to get chronological order for display and replace stored media
      // paths with signed URLs. Public media_url values can be stale/invalid.
      const chronologicalMessages = await hydrateMessageMediaUrls(
        ([...messages].reverse()) as WhatsAppMessage[],
      );
      
      // Next cursor is the oldest message's sent_at if we got a full page
      const nextCursor = messages.length === pageSize ? messages[messages.length - 1]?.sent_at : null;

      return {
        messages: chronologicalMessages,
        nextCursor,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: null as string | null,
    enabled: !!conversationId,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // Realtime updates are now handled centrally by WhatsAppRealtimeBus
  // (see src/contexts/WhatsAppRealtimeBus.tsx). No per-conversation channel here.


  // Flatten all pages into a single messages array
  const allMessages = query.data?.pages.flatMap(page => page.messages) || [];

  // Retry media download for a specific message
  const retryMediaDownload = useCallback(async (messageId: string) => {
    try {
      // Create a media job for retry
      const message = allMessages.find(m => m.id === messageId);
      if (!message) return;

      // Call edge function to retry media download
      await supabase.functions.invoke("media-worker", {
        body: { message_id: messageId, force: true }
      });

      // Refetch to get updated status
      queryClient.invalidateQueries({ 
        queryKey: ["whatsapp-messages-paginated", conversationId] 
      });
    } catch (error) {
      console.error("Error retrying media download:", error);
    }
  }, [allMessages, conversationId, queryClient]);

  return {
    ...query,
    messages: allMessages,
    hasOlderMessages: query.hasNextPage,
    loadOlderMessages: query.fetchNextPage,
    isLoadingOlder: query.isFetchingNextPage,
    retryMediaDownload,
  };
}
