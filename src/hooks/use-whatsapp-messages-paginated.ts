import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback } from "react";
import type { WhatsAppMessage } from "./use-whatsapp-conversations";

interface PaginatedMessagesResult {
  messages: WhatsAppMessage[];
  nextCursor: string | null;
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
      
      // Reverse to get chronological order for display
      const chronologicalMessages = [...messages].reverse();
      
      // Next cursor is the oldest message's sent_at if we got a full page
      const nextCursor = messages.length === pageSize ? messages[messages.length - 1]?.sent_at : null;

      return {
        messages: chronologicalMessages as WhatsAppMessage[],
        nextCursor,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: null as string | null,
    enabled: !!conversationId,
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
