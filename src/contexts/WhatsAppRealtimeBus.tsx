import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFloatingChat } from "@/contexts/FloatingChatContext";
import { toast } from "@/hooks/use-toast";
import { MessageCircle } from "lucide-react";

/**
 * Unified WhatsApp Realtime Bus.
 *
 * Replaces multiple per-conversation / global channels with a SINGLE channel
 * per organization that fans-out incoming events to every relevant React Query
 * cache key:
 *   - ["whatsapp-conversations", ...]           (list page + floating chat)
 *   - ["whatsapp-messages-paginated", convId]   (active chat)
 *   - ["whatsapp-messages", convId]             (legacy hook, fallback invalidate)
 *   - ["lead-messages", leadId]                 (lead history tab)
 *
 * Mount once at AppLayout level (inside FloatingChatProvider).
 */
export function WhatsAppRealtimeBus() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { state: floatingChatState, openConversation } = useFloatingChat();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyAfterRef = useRef(Date.now());
  const floatingChatStateRef = useRef(floatingChatState);
  const openConversationRef = useRef(openConversation);

  useEffect(() => {
    floatingChatStateRef.current = floatingChatState;
  }, [floatingChatState]);

  useEffect(() => {
    openConversationRef.current = openConversation;
  }, [openConversation]);

  useEffect(() => {
    if (!profile?.organization_id) return;

    const orgId = profile.organization_id;
    notifyAfterRef.current = Date.now();

    const debouncedInvalidateConversations = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
        debounceRef.current = null;
      }, 800);
    };

    const findCachedMessage = (messageId: string, conversationId: string) => {
      // Look in paginated messages cache
      const paginatedData = queryClient.getQueryData(["whatsapp-messages-paginated", conversationId]) as any;
      if (paginatedData?.pages) {
        for (const page of paginatedData.pages) {
          const found = page.messages?.find((m: any) => m.id === messageId);
          if (found) return found;
        }
      }

      // Look in legacy messages cache
      const legacyData = queryClient.getQueriesData({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === "whatsapp-messages" &&
          q.queryKey[1] === conversationId,
      });
      for (const [, data] of legacyData) {
        if (Array.isArray(data)) {
          const found = data.find((m: any) => m.id === messageId);
          if (found) return found;
        }
      }

      return null;
    };

    const signMessageMediaUrl = async (msg: any) => {
      if (!msg?.media_storage_path) return msg;

      // Se já temos a mensagem no cache com uma URL válida e o caminho da mídia é o mesmo, reutiliza!
      const existingMsg = findCachedMessage(msg.id, msg.conversation_id);
      const { data, error } = await supabase.storage
        .from("whatsapp-media")
        .createSignedUrl(msg.media_storage_path, 24 * 60 * 60);

      if (error || !data?.signedUrl) {
        console.warn("[WhatsAppRealtimeBus] Could not sign media URL", {
          messageId: msg.id,
          storagePath: msg.media_storage_path,
          error,
        });
        // Preserva a URL existente em caso de erro de assinatura temporário
        if (existingMsg?.media_url) {
          return { ...msg, media_url: existingMsg.media_url };
        }
        return msg;
      }

      return { ...msg, media_url: data.signedUrl };
    };

    const getWhatsAppPreview = (msg: any, displayName: string) => {
      const type = String(msg?.message_type || "text").toLowerCase();
      if (type === "audio") return `${displayName} te enviou um audio`;
      if (type === "image" || type === "sticker") return `${displayName} te enviou uma imagem`;
      if (type === "video") return `${displayName} te enviou um video`;
      if (type === "document") return `${displayName} te enviou um arquivo`;
      return msg?.content || `${displayName} te enviou uma mensagem`;
    };

    const isFreshRealtimeInsert = (createdAt?: string | null) => {
      if (!createdAt) return true;
      const createdTime = Date.parse(createdAt);
      if (Number.isNaN(createdTime)) return true;
      return createdTime >= notifyAfterRef.current - 5000;
    };

    const findCachedConversation = (conversationId: string) =>
      queryClient
        .getQueriesData({ queryKey: ["whatsapp-conversations"] })
        .flatMap(([, data]) => (Array.isArray(data) ? data : []))
        .find((c: any) => c?.id === conversationId);

    const fetchConversationForNotification = async (conversationId: string) => {
      const cached = findCachedConversation(conversationId);
      if (cached?.lead || cached?.contact_name) return cached;

      const { data } = await supabase
        .from("whatsapp_conversations")
        .select("*, lead:leads!whatsapp_conversations_lead_id_fkey(id, name, whatsapp_avatar_url)")
        .eq("id", conversationId)
        .maybeSingle();

      return data || cached;
    };

    // Sound is handled by use-notifications via the notifications table.
    // Bus must NOT play sound — it would duplicate / fire on every echoed
    // outgoing message coming back from the webhook.

    const updateLegacyCache = (
      conversationId: string,
      mutator: (msgs: any[]) => any[],
    ) => {
      queryClient.setQueriesData(
        {
          predicate: (q) =>
            Array.isArray(q.queryKey) &&
            q.queryKey[0] === "whatsapp-messages" &&
            q.queryKey[1] === conversationId,
        },
        (old: any) => (Array.isArray(old) ? mutator(old) : old),
      );
    };

    const upsertInPaginated = (conversationId: string, msg: any) => {
      const key = ["whatsapp-messages-paginated", conversationId];
      queryClient.setQueryData(key, (old: any) => {
        if (!old?.pages?.[0]) return old;
        const newCid = msg.client_message_id;
        const flat = old.pages.flatMap((p: any) => p.messages);
        const exists = flat.some(
          (m: any) =>
            m.id === msg.id ||
            (m.client_message_id && newCid && m.client_message_id === newCid),
        );
        if (exists) {
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              messages: page.messages.map((m: any) =>
                m.id === msg.id ||
                (m.client_message_id && newCid && m.client_message_id === newCid)
                  ? { ...m, ...msg, media_url: msg.media_url || m.media_url }
                  : m,
              ),
            })),
          };
        }
        return {
          ...old,
          pages: [
            { ...old.pages[0], messages: [...old.pages[0].messages, msg] },
            ...old.pages.slice(1),
          ],
        };
      });
    };

    const updateInPaginated = (conversationId: string, msg: any) => {
      const key = ["whatsapp-messages-paginated", conversationId];
      queryClient.setQueryData(key, (old: any) => {
        if (!old?.pages) return old;
        const cid = msg.client_message_id;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            messages: page.messages.map((m: any) =>
              m.id === msg.id ||
              (m.client_message_id && cid && m.client_message_id === cid)
                ? { ...m, ...msg, media_url: msg.media_url || m.media_url }
                : m,
            ),
          })),
        };
      });
    };

    const channel = supabase
      .channel(`whatsapp-bus-${orgId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages" },
        async (payload) => {
          const msg = await signMessageMediaUrl(payload.new as any);
          if (!msg?.conversation_id) return;

          // Fan-out: paginated cache for the active conversation
          upsertInPaginated(msg.conversation_id, msg);

          // Legacy ["whatsapp-messages", convId, ...] cache used by FloatingChat
          updateLegacyCache(msg.conversation_id, (msgs) => {
            const cid = msg.client_message_id;
            const exists = msgs.some(
              (m) =>
                m.id === msg.id ||
                (m.client_message_id && cid && m.client_message_id === cid),
            );
            if (exists) {
              return msgs.map((m) =>
                m.id === msg.id ||
                (m.client_message_id && cid && m.client_message_id === cid)
                  ? { ...m, ...msg }
                  : m,
              );
            }
            return [...msgs, msg];
          });

          // Conversations list updates (last_message, unread_count via DB trigger)
          debouncedInvalidateConversations();

          // Lead messages cache — invalidate by conversation->lead lookup
          const conv = await fetchConversationForNotification(msg.conversation_id);

          if (!msg.from_me && isFreshRealtimeInsert(msg.created_at)) {
            const floating = floatingChatStateRef.current;
            const isSameFloatingConversation =
              floating.isOpen &&
              !floating.isMinimized &&
              floating.activeConversation?.id === msg.conversation_id;

            if (!isSameFloatingConversation) {
              const displayName =
                conv?.lead?.name ||
                (conv?.contact_name && conv.contact_name !== conv.contact_phone ? conv.contact_name : null) ||
                "Nova mensagem";
              const preview = getWhatsAppPreview(msg, displayName);

              toast({
                title: <span className="block max-w-[250px] truncate">{displayName}</span>,
                description: <span className="line-clamp-2">{preview}</span>,
                duration: 4200,
                className: "border-0 bg-background/92 p-4 pr-8 shadow-2xl backdrop-blur-xl",
                action: conv ? (
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    onClick={() => openConversationRef.current(conv)}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Abrir
                  </button>
                ) : undefined,
              });
            }
          }

          if (conv?.lead_id) {
            queryClient.invalidateQueries({
              queryKey: ["lead-messages", conv.lead_id],
            });
            queryClient.invalidateQueries({
              predicate: (q) =>
                Array.isArray(q.queryKey) &&
                q.queryKey[0] === "whatsapp-messages" &&
                q.queryKey.includes(conv.lead_id),
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_messages" },
        async (payload) => {
          const msg = await signMessageMediaUrl(payload.new as any);
          if (!msg?.conversation_id) return;
          updateInPaginated(msg.conversation_id, msg);
          updateLegacyCache(msg.conversation_id, (msgs) => {
            const cid = msg.client_message_id;
            return msgs.map((m) =>
              m.id === msg.id ||
              (m.client_message_id && cid && m.client_message_id === cid)
                ? { ...m, ...msg }
                : m,
            );
          });

          const conv = queryClient
            .getQueriesData({ queryKey: ["whatsapp-conversations"] })
            .flatMap(([, data]) => (Array.isArray(data) ? data : []))
            .find((c: any) => c?.id === msg.conversation_id);
          if (conv?.lead_id) {
            queryClient.invalidateQueries({
              queryKey: ["lead-messages", conv.lead_id],
            });
            queryClient.invalidateQueries({
              predicate: (q) =>
                Array.isArray(q.queryKey) &&
                q.queryKey[0] === "whatsapp-messages" &&
                q.queryKey.includes(conv.lead_id),
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conversations" },
        () => {
          debouncedInvalidateConversations();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          notifyAfterRef.current = Date.now();
        }
      });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [profile?.organization_id, queryClient]);

  return null;
}
