import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

import { formatPhoneForWhatsApp, normalizePhone } from "@/lib/phone-utils";
import { getWhatsAppClient } from "@/lib/whatsapp-provider";
import { callEvolutionGo } from "@/hooks/use-evolution-go";

const WHATSAPP_SEND_COOLDOWN_MS = 1000;
const lastWhatsAppSendByUser = new Map<string, number>();

export interface WhatsAppConversation {
  id: string;
  session_id: string;
  lead_id: string | null;
  remote_jid: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_picture: string | null;
  contact_presence: string | null;
  presence_updated_at: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  is_group: boolean;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  session?: {
    id: string;
    instance_name: string;
    phone_number: string | null;
    status: string;
    organization_id: string;
    provider?: "evolution" | "evolution_go" | null;
  };
  lead?: {
    id: string;
    name: string;
    whatsapp_avatar_url?: string | null;
    pipeline_id?: string | null;
    stage_id?: string | null;
    pipeline?: {
      id: string;
      name: string;
    } | null;
    stage?: {
      id: string;
      name: string;
      color: string | null;
    } | null;
    tags?: Array<{
      tag: {
        id: string;
        name: string;
        color: string;
      };
    }>;
  };
}

export interface WhatsAppMessage {
  id: string;
  conversation_id: string;
  session_id: string;
  message_id: string;
  client_message_id?: string | null;
  from_me: boolean;
  content: string | null;
  message_type: string;
  media_url: string | null;
  media_mime_type: string | null;
  media_status?: 'pending' | 'ready' | 'failed' | null;
  media_error?: string | null;
  media_size?: number | null;
  media_storage_path?: string | null;
  remote_jid?: string | null;
  reaction_to_message_id?: string | null;
  reaction_emoji?: string | null;
  reaction_sender_jid?: string | null;
  reaction_sender_name?: string | null;
  metadata?: Record<string, any>;
  status: string;
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  sender_jid: string | null;
  sender_name: string | null;
}

export interface ConversationFilters {
  hideGroups?: boolean;
  showArchived?: boolean;
}

const avatarSyncStartedBySession = new Map<string, number>();

function formatOutgoingLastMessage(messageType: string | undefined, text: string | null, senderName: string | null, isGroup: boolean) {
  const type = messageType || "text";
  if (type === "text") return text || "";
  const mediaLabels: Record<string, { article: string; noun: string }> = {
    image: { article: "uma", noun: "imagem" },
    video: { article: "um", noun: "vídeo" },
    audio: { article: "um", noun: "áudio" },
    document: { article: "um", noun: "documento" },
    sticker: { article: "uma", noun: "figurinha" },
  };
  const label = mediaLabels[type] || { article: "uma", noun: "mídia" };
  const actor = isGroup && senderName ? senderName : "Você";
  return `${actor} enviou ${label.article} ${label.noun}`;
}

async function hydrateMessageMediaUrls(messages: WhatsAppMessage[]): Promise<WhatsAppMessage[]> {
  const messagesWithPrivateMedia = messages.filter((message) => (
    message.media_storage_path
  ));

  if (messagesWithPrivateMedia.length === 0) return messages;

  const uniquePaths = [...new Set(messagesWithPrivateMedia.map((message) => message.media_storage_path!).filter(Boolean))];
  const { data, error } = await supabase.storage
    .from("whatsapp-media")
    .createSignedUrls(uniquePaths, 60 * 60);

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

function getWhatsappMediaStoragePath(url?: string | null): string | null {
  if (!url) return null;
  const marker = "/storage/v1/object/public/whatsapp-media/";
  const index = url.indexOf(marker);
  if (index < 0) return null;
  return decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
}

function getPhoneVariants(phone?: string | null): string[] {
  const cleaned = (phone || "").replace(/\D/g, "");
  const normalized = normalizePhone(phone || "");
  const baseVariants = [
    cleaned,
    normalized,
    normalized ? `55${normalized}` : "",
  ].filter(Boolean);

  const brMobileVariants: string[] = [];
  for (const variant of baseVariants) {
    const local = normalizePhone(variant);
    if (local.length === 11 && local[2] === "9") {
      const withoutNinthDigit = `${local.slice(0, 2)}${local.slice(3)}`;
      brMobileVariants.push(withoutNinthDigit, `55${withoutNinthDigit}`);
    }
    if (local.length === 10) {
      const withNinthDigit = `${local.slice(0, 2)}9${local.slice(2)}`;
      brMobileVariants.push(withNinthDigit, `55${withNinthDigit}`);
    }
  }

  return [...new Set(baseVariants.concat(brMobileVariants))];
}

function syncMissingConversationAvatars(conversations: WhatsAppConversation[], onSynced?: () => void) {
  const sessionIds = [
    ...new Set(
      conversations
        .filter((conversation) => (
          conversation.session?.provider === "evolution_go" &&
          !conversation.contact_picture &&
          conversation.session_id
        ))
        .map((conversation) => conversation.session_id),
    ),
  ];

  for (const sessionId of sessionIds) {
    const lastStartedAt = avatarSyncStartedBySession.get(sessionId) || 0;
    if (Date.now() - lastStartedAt < 60_000) continue;
    avatarSyncStartedBySession.set(sessionId, Date.now());
    supabase.functions
      .invoke("sync-whatsapp-contacts", { body: { session_id: sessionId, limit: 100 } })
      .then(({ data, error }) => {
        if (error) {
          console.error("Error syncing WhatsApp avatars:", error);
          avatarSyncStartedBySession.delete(sessionId);
          return;
        }
        console.log("WhatsApp avatar sync finished:", data);
        if (data?.success) {
          onSynced?.();
        }
      });
  }
}

function getNested(obj: any, path: string) {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

function extractProviderMessageId(data: any): string | null {
  const paths = [
    "sentMessageId",
    "messageId",
    "messageID",
    "MessageID",
    "id",
    "ID",
    "Id",
    "key.id",
    "key.ID",
    "Key.ID",
    "Info.ID",
    "Info.Id",
    "info.ID",
    "info.id",
    "data.sentMessageId",
    "data.messageId",
    "data.messageID",
    "data.MessageID",
    "data.id",
    "data.ID",
    "data.key.id",
    "data.Key.ID",
    "data.Info.ID",
    "data.Info.Id",
    "data.info.ID",
    "data.info.id",
    "Data.messageId",
    "Data.MessageID",
    "Data.id",
    "Data.ID",
    "Data.Info.ID",
    "Data.Info.Id",
    "message.key.id",
    "message.Key.ID",
    "data.message.key.id",
    "data.message.Key.ID",
    "response.key.id",
    "response.Key.ID",
  ];
  for (const path of paths) {
    const value = getNested(data, path);
    if (value) return String(value);
  }
  return null;
}

export function useWhatsAppConversations(
  sessionId?: string, 
  filters?: ConversationFilters,
  accessibleSessionIds?: string[]
) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["whatsapp-conversations", sessionId, filters, accessibleSessionIds],
    queryFn: async () => {
      console.log('[WhatsApp Conversations Load] Iniciando carregamento...', {
        authUserId: profile?.id,
        organizationActive: profile?.organization_id,
        sessionId,
        accessibleSessionIdsCount: accessibleSessionIds?.length,
        accessibleSessionIds
      });

      if (!profile?.organization_id) {
        console.warn('[WhatsApp Conversations Load] Organizacao nao identificada');
        return [];
      }

      let query = supabase
        .from("whatsapp_conversations")
        .select(`
          *,
          session:whatsapp_sessions!whatsapp_conversations_session_id_fkey(id, instance_name, phone_number, status, organization_id, provider),
          lead:leads!whatsapp_conversations_lead_id_fkey(
            id, 
            name,
            whatsapp_avatar_url,
            pipeline_id,
            stage_id,
            pipeline:pipelines(id, name),
            stage:stages(id, name, color),
            tags:lead_tags(tag:tags(id, name, color))
          )
        `)
        .eq("organization_id", profile.organization_id)
        .is("deleted_at", null)
        // Relaxado conforme solicitado para nao ocultar conversas que podem ter last_message_at nulo
        // .not("last_message_at", "is", null) 
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (sessionId) {
        query = query.eq("session_id", sessionId);
        console.log(`[WhatsApp Conversations Load] Filtrando por sessao unica: ${sessionId}`);
      } else if (accessibleSessionIds !== undefined) {
        // Se ainda nao temos a lista de sessoes (undefined), nao retornamos nada para nao dar flash de vazio
        if (accessibleSessionIds === null) return [];
        
        if (accessibleSessionIds.length === 0) {
          console.log('[WhatsApp Conversations Load] Lista de sessoes acessiveis esta vazia. Retornando [].');
          return [];
        }

        query = query.in("session_id", accessibleSessionIds);
        console.log(`[WhatsApp Conversations Load] Filtrando por multiplas sessoes: ${accessibleSessionIds.join(', ')}`);
      }

      // Filter archived
      if (!filters?.showArchived) {
        query = query.is("archived_at", null);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[WhatsApp Conversations Load] Erro na query:', error);
        throw error;
      }
      
      console.log(`[WhatsApp Conversations Load] Sucesso: ${data?.length || 0} conversas retornadas`);
      const conversations = data as WhatsAppConversation[];
      
      // Filter groups on client side (more flexible)
      let conversationsResult = filters?.hideGroups 
        ? conversations.filter(c => !c.is_group)
        : conversations;
      
      // ===== BUSCAR LEADS POR TELEFONE PARA CONVERSAS SEM LEAD_ID =====
      // Isso garante que tags aparecam mesmo se a conversa nao foi vinculada automaticamente
      const unlinkedConversations = conversationsResult.filter(c => !c.lead_id && c.contact_phone && !c.is_group);
      
      if (unlinkedConversations.length > 0) {
        // Obter lista de telefones originais e normalizados para busca
        const allPossiblePhones = [
          ...new Set(unlinkedConversations.flatMap(c => getPhoneVariants(c.contact_phone)))
        ];
        
        // Buscar apenas leads que correspondem aos telefones (otimizado)
        const { data: leads, error: leadsError } = await supabase
          .from('leads')
          .select('id, phone, name, whatsapp_avatar_url, pipeline_id, stage_id, pipeline:pipelines(id, name), stage:stages(id, name, color), tags:lead_tags(tag:tags(id, name, color))')
          .eq('organization_id', profile?.organization_id)
          .or(allPossiblePhones.map((phone) => `phone.ilike.%${phone}%`).join(","));
        
        if (leadsError) {
          console.error("Error fetching leads for linking:", leadsError);
        } else if (leads && leads.length > 0) {
          // Criar mapa de telefone normalizado -> lead para busca eficiente
          const phoneToLead = new Map<string, typeof leads[0]>();
          for (const lead of leads) {
            if (lead.phone) {
              const normalizedLeadPhone = normalizePhone(lead.phone);
              if (normalizedLeadPhone) {
                phoneToLead.set(normalizedLeadPhone, lead);
              }
              // Tambem indexar pelo telefone bruto se disponivel no banco
              phoneToLead.set(lead.phone, lead);
            }
          }
          
          // Associar leads as conversas
          conversationsResult = conversationsResult.map(conv => {
            if (conv.lead_id || !conv.contact_phone || conv.is_group) return conv;
            
            const normalizedConvPhone = normalizePhone(conv.contact_phone);
            const matchingLead = phoneToLead.get(normalizedConvPhone) || phoneToLead.get(conv.contact_phone);
            
            if (matchingLead) {
              return { 
                ...conv, 
                lead_id: matchingLead.id,
                lead: { 
                  id: matchingLead.id, 
                  name: matchingLead.name,
                  whatsapp_avatar_url: matchingLead.whatsapp_avatar_url,
                  pipeline_id: matchingLead.pipeline_id,
                  stage_id: matchingLead.stage_id,
                  pipeline: matchingLead.pipeline as any,
                  stage: matchingLead.stage as any,
                  tags: matchingLead.tags as any
                } 
              };
            }
            return conv;
          });
        }
      }
      
      syncMissingConversationAvatars(conversationsResult, () => {
        queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
      });

      return conversationsResult;
    },
    enabled: !!profile?.organization_id,
    // Realtime push via WhatsAppRealtimeBus + 2min safety refetch
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
    gcTime: 1000 * 60 * 10,
  });

}

export function useWhatsAppConversation(conversationId: string | null) {
  return useQuery({
    queryKey: ["whatsapp-conversation", conversationId],
    queryFn: async () => {
      if (!conversationId) return null;

      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select(`
          *,
          session:whatsapp_sessions!whatsapp_conversations_session_id_fkey(id, instance_name, phone_number, status, organization_id, provider),
          lead:leads!whatsapp_conversations_lead_id_fkey(id, name, whatsapp_avatar_url)
        `)
        .eq("id", conversationId)
        .single();

      if (error) throw error;
      return data as WhatsAppConversation;
    },
    enabled: !!conversationId,
  });
}

export function useWhatsAppMessages(
  conversationId: string | null, 
  leadId?: string | null,
  limit: number = 50
) {
  const queryClient = useQueryClient();
  const messageQueryKey = ["whatsapp-messages", conversationId, leadId, limit];

  const query = useQuery({
    queryKey: messageQueryKey,
    queryFn: async () => {
      if (!conversationId && !leadId) return [];

      if (leadId) {
        const { data, error } = await supabase.functions.invoke("whatsapp-history-access", {
          body: { conversationId, leadId, allMessages: true },
        });

        if (!error && data && !data.error) {
          return hydrateMessageMediaUrls((data.messages || []) as WhatsAppMessage[]);
        }

        if (!conversationId) {
          if (error) throw error;
          throw new Error(data?.error || "Erro ao carregar historico do lead");
        }
      }

      if (conversationId) {
        const { data, error } = await supabase
          .from("whatsapp_messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .order("sent_at", { ascending: false }) // Mudado para false para pegar as mais recentes
          .limit(limit);

        if (!error && data) {
          // Reverter para ordem ascendente para o chat
          return hydrateMessageMediaUrls((data as WhatsAppMessage[]).reverse());
        }

        if (error && !leadId) {
          throw error;
        }

        if (!leadId) {
          return hydrateMessageMediaUrls((data || []) as WhatsAppMessage[]);
        }
      }

      const { data, error } = await supabase.functions.invoke("whatsapp-history-access", {
        body: { conversationId, leadId },
      });

      if (error) throw error;
      return hydrateMessageMediaUrls((data?.messages || []) as WhatsAppMessage[]);
    },
    enabled: !!conversationId || !!leadId,
    // Realtime updates are pushed by WhatsAppRealtimeBus; no polling needed
    refetchIntervalInBackground: false,
    staleTime: 60_000,
    gcTime: 1000 * 60 * 5,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });


  // Realtime updates are now handled centrally by WhatsAppRealtimeBus
  // (see src/contexts/WhatsAppRealtimeBus.tsx). No per-conversation channel here.


  return query;
}

export function useSendWhatsAppMessage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      conversation,
      text,
      mediaUrl,
      mediaType,
      base64,
      mimetype,
      filename,
      sendSessionId,
      previewMediaUrl,
      _optimisticId,
    }: {
      conversation: WhatsAppConversation;
      text: string;
      mediaUrl?: string;
      mediaType?: string;
      base64?: string;
      mimetype?: string;
      filename?: string;
      sendSessionId?: string;
      previewMediaUrl?: string;
      _optimisticId?: string;
    }) => {
      console.log("[useSendWhatsAppMessage] Starting mutation", { 
        convId: conversation.id, 
        text: text?.substring(0, 20),
        hasMedia: !!(mediaUrl || base64)
      });

      const rateLimitUserId = profile?.id || "anonymous";
      const now = Date.now();
      const lastSendAt = lastWhatsAppSendByUser.get(rateLimitUserId) || 0;

      if (now - lastSendAt < WHATSAPP_SEND_COOLDOWN_MS) {
        throw new Error("RATE_LIMIT_LOCAL");
      }

      lastWhatsAppSendByUser.set(rateLimitUserId, now);

      const conversationSession = (conversation as any).session;
      let session = conversationSession;

      if (sendSessionId && sendSessionId !== conversationSession?.id) {
        const { data: preferredSession, error: preferredError } = await supabase
          .from("whatsapp_sessions")
          .select("id, instance_name, phone_number, status, organization_id, provider")
          .eq("id", sendSessionId)
          .maybeSingle();

        if (preferredError) throw preferredError;
        if (preferredSession?.status === "connected") {
          session = preferredSession;
        }
      }

      if (!session || session.status !== "connected") {
        const organizationId = conversationSession?.organization_id || profile?.organization_id;
        let connectedQuery = supabase
          .from("whatsapp_sessions")
          .select("id, instance_name, phone_number, status, organization_id, provider")
          .eq("status", "connected")
          .order("last_connected_at", { ascending: false, nullsFirst: false })
          .limit(2);

        if (organizationId) {
          connectedQuery = connectedQuery.eq("organization_id", organizationId);
        }

        const { data: connectedSessions, error: connectedError } = await connectedQuery;
        if (connectedError) throw connectedError;

        if (connectedSessions?.length === 1) {
          session = connectedSessions[0];
        } else if ((connectedSessions?.length || 0) > 1) {
          throw new Error("Selecione qual WhatsApp deseja usar para enviar esta mensagem.");
        }
      }

      if (!session) {
        throw new Error("Sessão não encontrada na conversa.");
      }

      if (session.status !== "connected") {
        throw new Error("WhatsApp desconectado. Reconecte ou selecione uma conexão ativa.");
      }
// Extract phone number from remote_jid and format
      const rawPhone = conversation.remote_jid
        .replace("@c.us", "")
        .replace("@s.whatsapp.net", "")
        .replace("@g.us", "");
      const phone = formatPhoneForWhatsApp(rawPhone);

      const isGroup = conversation.is_group;

      // Use optimistic ID if provided, otherwise generate new one
      const clientMessageId = _optimisticId || crypto.randomUUID();
      
      // If we have base64 media, upload to storage first for reliability
      let storedMediaUrl = mediaUrl;
      let storedMediaPath: string | null = getWhatsappMediaStoragePath(mediaUrl);
      
      if (base64 && mimetype && !storedMediaUrl) {
        try {
          // Decode base64 and upload to Supabase Storage
          const binaryString = atob(base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          // Get file extension from mimetype
          const extMap: Record<string, string> = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/gif": "gif",
            "image/webp": "webp",
            "video/mp4": "mp4",
            "audio/ogg": "ogg",
            "audio/webm": "webm",
            "audio/mpeg": "mp3",
            "application/pdf": "pdf",
          };
          const extension = extMap[mimetype.split(";")[0]] || "bin";
          
          // Upload path: orgs/{org_id}/sessions/{session_id}/outgoing/{clientMessageId}.{ext}
          const filePath = `orgs/${session.organization_id}/sessions/${session.id}/outgoing/${clientMessageId}.${extension}`;
          
          const { error: uploadError } = await supabase.storage
            .from("whatsapp-media")
            .upload(filePath, bytes, {
              contentType: mimetype.split(";")[0],
              upsert: true,
            });

          if (!uploadError) {
            const { data: urlData } = supabase.storage
              .from("whatsapp-media")
              .getPublicUrl(filePath);
            
            storedMediaUrl = urlData.publicUrl;
            storedMediaPath = filePath;
            console.log(`Media uploaded to storage: ${storedMediaUrl}`);
          } else {
            console.error("Error uploading media to storage:", uploadError);
            // Continue with base64 fallback
          }
        } catch (uploadErr) {
          console.error("Error processing media for upload:", uploadErr);
          // Continue with base64 fallback
        }
      }

      // Extract mentions from text (numbers only for now)
      const mentionMatches = text?.match(/@(\d{7,})/g);
      const mentions = mentionMatches ? mentionMatches.map(m => m.replace("@", "")) : [];

      // Determine proper content - don't use filename as content for media messages
      const isMediaMessage = !!(storedMediaUrl || base64);
      const isFilenameOnly = text && (
        text === filename || 
        text.match(/^[a-f0-9-]+\.(png|jpg|jpeg|gif|webp|mp4|mp3|ogg|pdf|doc|docx)$/i) ||
        text.match(/^\S+\.(png|jpg|jpeg|gif|webp|mp4|mp3|ogg|pdf|doc|docx)$/i)
      );
      const actualContent = isMediaMessage && isFilenameOnly ? null : text;
      const caption = isMediaMessage && actualContent ? actualContent : undefined;
      const provider = session.provider || "evolution_go";
      const safeMediaType = ["image", "video", "document", "audio"].includes(mediaType || "")
        ? (mediaType as "image" | "video" | "document" | "audio")
        : "image";
      let mediaSource = provider === "evolution_go" && safeMediaType === "audio" && base64
        ? base64
        : (storedMediaUrl || base64);
      if (provider === "evolution_go" && storedMediaPath && !(safeMediaType === "audio" && base64)) {
        const { data: signedMedia } = await supabase.storage
          .from("whatsapp-media")
          .createSignedUrl(storedMediaPath, 60 * 15);
        if (signedMedia?.signedUrl) {
          mediaSource = signedMedia.signedUrl;
        }
      }
      const destination = provider === "evolution_go" && isGroup ? conversation.remote_jid : phone;
      const whatsappClient = getWhatsAppClient({
        id: session.id,
        instance_name: session.instance_name,
        provider,
      });

      console.log("[useSendWhatsAppMessage] Calling WhatsApp provider", {
        provider,
        action: mediaSource ? "sendMedia" : "sendText",
        instance: session.instance_name,
        destination,
      });

      const sendResult = mediaSource
        ? await whatsappClient.sendMedia(
            destination,
            mediaSource,
            safeMediaType,
            mimetype || "application/octet-stream",
            filename,
            caption,
            { isGroup, mentions },
          )
        : await whatsappClient.sendText(destination, text, { isGroup, mentions });

      if (!sendResult.ok) {
        console.error("[useSendWhatsAppMessage] WhatsApp provider Error:", sendResult.error);
        throw new Error(sendResult.error || "Failed to send message");
      }
      
      console.log("[useSendWhatsAppMessage] WhatsApp provider Success:", { 
        provider,
        evolutionData: sendResult.data?.key?.id || sendResult.data?.messageId ? "has_id" : "no_id"
      });

      if (conversation.session_id !== session.id) {
        console.log("[useSendWhatsAppMessage] Rebinding conversation to active session", {
          conversationId: conversation.id,
          previousSessionId: conversation.session_id,
          activeSessionId: session.id,
        });

        const { data: reboundConversation, error: rebindError } = await (supabase.rpc as any)(
          "rebind_whatsapp_conversation_session",
          {
            p_conversation_id: conversation.id,
            p_session_id: session.id,
            p_remote_jid: conversation.remote_jid,
          },
        );

        if (rebindError) {
          console.error("[useSendWhatsAppMessage] Failed to rebind conversation session:", rebindError);
          const { error: directRebindError } = await supabase
            .from("whatsapp_conversations")
            .update({
              session_id: session.id,
              organization_id: session.organization_id,
              updated_at: new Date().toISOString(),
            })
            .eq("id", conversation.id);

          if (directRebindError) {
            console.error("[useSendWhatsAppMessage] Direct conversation rebind also failed; message will still be saved.", directRebindError);
          } else {
            conversation.session_id = session.id;
            conversation.organization_id = session.organization_id;
            (conversation as any).session = session;
          }
        } else {
          conversation.id = reboundConversation?.id || conversation.id;
          conversation.session_id = reboundConversation?.session_id || session.id;
          conversation.organization_id = reboundConversation?.organization_id || conversation.organization_id;
          conversation.lead_id = reboundConversation?.lead_id || conversation.lead_id;
          (conversation as any).session = session;
        }
      }

      if (!conversation.lead_id && !isGroup) {
        const phoneDigits = normalizePhone(conversation.contact_phone || conversation.remote_jid || phone);
        const tail = phoneDigits.slice(-8);
        if (tail) {
          const { data: leadMatches, error: leadMatchError } = await supabase
            .from("leads")
            .select("id, name, phone")
            .eq("organization_id", session.organization_id)
            .ilike("phone", `%${tail}%`)
            .limit(10);

          if (leadMatchError) {
            console.error("[useSendWhatsAppMessage] Failed to resolve lead by phone before saving message:", leadMatchError);
          } else {
            const matchedLead = (leadMatches || []).find((lead: any) =>
              normalizePhone(lead.phone || "").slice(-8) === tail,
            );

            if (matchedLead?.id) {
              conversation.lead_id = matchedLead.id;
              (conversation as any).lead = {
                ...((conversation as any).lead || {}),
                id: matchedLead.id,
                name: matchedLead.name,
              };
              await supabase
                .from("whatsapp_conversations")
                .update({
                  lead_id: matchedLead.id,
                  contact_name: matchedLead.name || conversation.contact_name,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", conversation.id);
            }
          }
        }
      }

      // Insert message in database with client_message_id for deduplication
      const messageId = extractProviderMessageId(sendResult.data) || clientMessageId;
      
      console.log("[useSendWhatsAppMessage] Inserting message into DB");
      const { error: insertError } = await supabase.from("whatsapp_messages").upsert({
        conversation_id: conversation.id,
        session_id: session.id,
        message_id: messageId,
        client_message_id: clientMessageId,
        from_me: true,
        content: actualContent,
        message_type: mediaType || "text",
        media_url: storedMediaUrl || null,
        media_mime_type: mimetype || null,
        media_status: storedMediaUrl ? 'ready' : (base64 ? 'pending' : null),
        media_storage_path: storedMediaPath,
        remote_jid: conversation.remote_jid,
        status: "sent",
        sent_at: new Date().toISOString(),
        sender_name: profile?.name || null,
      }, { onConflict: "session_id,message_id" });

      if (insertError) {
        console.error("[useSendWhatsAppMessage] insert whatsapp_messages Error:", insertError);
        throw new Error("Mensagem enviada no WhatsApp, mas não foi salva no histórico do CRM.");
      }

      if (!insertError && conversation.lead_id) {
        console.log("[useSendWhatsAppMessage] Logging to timeline");
        // Log to lead_timeline_events
        await supabase.from("lead_timeline_events").insert({
          organization_id: session.organization_id,
          lead_id: conversation.lead_id,
          event_type: "whatsapp_message_sent",
          title: "Mensagem WhatsApp enviada",
          description: actualContent || "Mídia enviada",
          user_id: profile?.id,
          metadata: {
            message_id: messageId,
            content: actualContent,
            media_type: mediaType || "text",
            session_id: session.id,
            instance_name: session.instance_name
          }
        });

        // Record first response time via edge function (non-blocking)
        try {
          await supabase.functions.invoke('calculate-first-response', {
            body: {
              lead_id: conversation.lead_id,
              organization_id: session.organization_id,
              channel: 'whatsapp',
              actor_user_id: profile?.id || null,
              is_automation: false,
            },
          });
          console.log("[useSendWhatsAppMessage] First response recorded for lead", conversation.lead_id);
        } catch (frErr) {
          console.error("[useSendWhatsAppMessage] First response recording failed (non-blocking):", frErr);
        }
      }

      if (insertError) {
        console.error("Error inserting sent message:", insertError);
      }

        console.log("[useSendWhatsAppMessage] Updating conversation last_message");
        await supabase
          .from("whatsapp_conversations")
          .update({
            last_message: formatOutgoingLastMessage(mediaType, actualContent, profile?.name || null, isGroup),
            last_message_at: new Date().toISOString(),
            unread_count: 0,
            session_id: session.id,
          })
          .eq("id", conversation.id);
        
        console.log("[useSendWhatsAppMessage] Mutation complete!");

      return { ...sendResult.data, clientMessageId, conversationId: conversation.id };
    },
    // Optimistic update: add message to cache immediately
    onMutate: async (variables) => {
      const conversationId = variables.conversation.id;
      const optimisticId = crypto.randomUUID();
      
      // Store optimistic ID in variables for use in mutationFn
      (variables as any)._optimisticId = optimisticId;

      // Cancel any outgoing refetches across all variants of the key
      const messagesPredicate = (q: any) =>
        Array.isArray(q.queryKey) &&
        q.queryKey[0] === "whatsapp-messages" &&
        q.queryKey[1] === conversationId;
      await queryClient.cancelQueries({ predicate: messagesPredicate });

      // Snapshot previous value (first cache that matches)
      const previousMessages =
        queryClient.getQueriesData<WhatsAppMessage[]>({ predicate: messagesPredicate })[0]?.[1];

      // Create optimistic message with client_message_id for deduplication
      // Don't show filename as content
      const isMediaMessage = !!(variables.mediaType && variables.mediaType !== "text");
      const isFilenameContent = variables.text && (
        variables.text === variables.filename ||
        variables.text.match(/^[a-f0-9-]+\.(png|jpg|jpeg|gif|webp|mp4|mp3|ogg|pdf|doc|docx)$/i) ||
        variables.text.match(/^\S+\.(png|jpg|jpeg|gif|webp|mp4|mp3|ogg|pdf|doc|docx)$/i)
      );
      const optimisticContent = isMediaMessage && isFilenameContent ? null : variables.text;

      const optimisticMessage: WhatsAppMessage & { client_message_id?: string } = {
        id: optimisticId,
        conversation_id: conversationId,
        session_id: variables.sendSessionId || variables.conversation.session_id,
        message_id: optimisticId,
        client_message_id: optimisticId, // Important for deduplication with realtime
        from_me: true,
        content: optimisticContent,
        message_type: variables.mediaType || "text",
        media_url: variables.previewMediaUrl || variables.mediaUrl || null,
        media_mime_type: variables.mimetype || null,
        remote_jid: variables.conversation.remote_jid,
        status: "pending",
        sent_at: new Date().toISOString(),
        delivered_at: null,
        read_at: null,
        sender_jid: null,
        sender_name: profile?.name || null,
        media_status: (variables.previewMediaUrl || variables.mediaUrl) ? "ready" : null,
        media_storage_path: null,
        media_error: null,
      };

      // Optimistically update legacy cache (any variant of ["whatsapp-messages", convId, ...])
      queryClient.setQueriesData<WhatsAppMessage[]>(
        {
          predicate: (q) =>
            Array.isArray(q.queryKey) &&
            q.queryKey[0] === "whatsapp-messages" &&
            q.queryKey[1] === conversationId,
        },
        (old) => (old ? [...old, optimisticMessage] : [optimisticMessage]),
      );

      // Also update paginated query
      queryClient.setQueryData(
        ["whatsapp-messages-paginated", conversationId],
        (old: any) => {
          if (!old?.pages?.[0]) return old;
          return {
            ...old,
            pages: [
              {
                ...old.pages[0],
                messages: [...old.pages[0].messages, optimisticMessage],
              },
              ...old.pages.slice(1),
            ],
          };
        }
      );

      // Return context with snapshot
      return { previousMessages, optimisticId, conversationId };
    },
    onSuccess: (result, variables, context) => {
      const conversationId = (result as any)?.conversationId || variables.conversation.id;
      const originalConversationId = context?.conversationId || variables.conversation.id;
      const messageKeys = new Set([conversationId, originalConversationId]);
      
      // Update optimistic message with real data across all variants of the key
      if (context?.optimisticId) {
        for (const cacheConversationId of messageKeys) {
          queryClient.setQueriesData<WhatsAppMessage[]>(
            {
              predicate: (q) =>
                Array.isArray(q.queryKey) &&
                q.queryKey[0] === "whatsapp-messages" &&
                q.queryKey[1] === cacheConversationId,
            },
            (old) => old?.map(msg =>
              msg.id === context.optimisticId
                ? {
                    ...msg,
                    id: result?.clientMessageId || msg.id,
                    conversation_id: conversationId,
                    status: "sent",
                    media_url: variables.mediaUrl || msg.media_url,
                    media_status: variables.mediaUrl || variables.previewMediaUrl || msg.media_url ? "ready" : msg.media_status,
                  }
                : msg
            )
          );
        }
      }

      // Invalidate conversations to update last_message
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
      queryClient.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === "whatsapp-messages" &&
          messageKeys.has(q.queryKey[1] as string),
      });
    },
    onError: (error: Error, variables, context) => {
      const errorMessage = error.message || "";
      const sentButNotPersisted =
        errorMessage.includes("Mensagem enviada no WhatsApp, mas");

      if (sentButNotPersisted && context?.optimisticId) {
        queryClient.setQueriesData<WhatsAppMessage[]>(
          {
            predicate: (q) =>
              Array.isArray(q.queryKey) &&
              q.queryKey[0] === "whatsapp-messages" &&
              q.queryKey[1] === variables.conversation.id,
          },
          (old) => old?.map(msg =>
            msg.id === context.optimisticId
              ? {
                  ...msg,
                  status: "error",
                  media_error: errorMessage,
                }
              : msg
          )
        );
      } else if (context?.previousMessages) {
        queryClient.setQueriesData(
          {
            predicate: (q) =>
              Array.isArray(q.queryKey) &&
              q.queryKey[0] === "whatsapp-messages" &&
              q.queryKey[1] === variables.conversation.id,
          },
          context.previousMessages
        );
      }
      
      const isRateLimited = errorMessage.includes("RATE_LIMIT_LOCAL") ||
                            errorMessage.includes("rate_limit_exceeded") ||
                            errorMessage.includes("Muitas requisi");
      
      // Check for different error types
      const isDisconnected = errorMessage.includes("WHATSAPP_DISCONNECTED") || 
                             errorMessage.includes("desconectada") ||
                             errorMessage.includes("QR Code") ||
                             errorMessage.includes("not connected");
      
      const isNumberNotExists = errorMessage.includes("não possui WhatsApp") ||
                                errorMessage.includes("não está registrado") ||
                                errorMessage.includes("not exist") ||
                                errorMessage.includes("invalid number");
      
      let title = "Erro ao enviar mensagem";
      let description = errorMessage;
      
      if (isDisconnected) {
        title = "WhatsApp Desconectado";
        description = "Vá em Configurações > WhatsApp e escaneie o QR Code novamente.";
      } else if (isNumberNotExists) {
        title = "Contato sem WhatsApp";
        description = "Este número não está no WhatsApp. Tente ligar ou enviar SMS.";
      } else if (isRateLimited) {
        title = "Aguarde um instante";
        description = "Você está enviando mensagens muito rápido. Tente novamente em alguns segundos.";
      }
      
      toast({
        title,
        description,
        variant: "destructive",
      });
    },
  });
}

export function useMarkConversationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversation: { 
      id: string; 
      session_id: string;
      remote_jid: string;
      is_group?: boolean;
    }) => {
      // APENAS atualiza localmente - NAO envia sendSeen para Evolution API
      // Isso evita marcar como lida no WhatsApp automaticamente
      // O usuario deve usar "Marcar como lida no WhatsApp" manualmente
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ unread_count: 0 })
        .eq("id", conversation.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
    },
  });
}

// Hook separado para marcar como lida no WhatsApp (acao manual)
export function useMarkAsSeenOnWhatsApp() {
  return useMutation({
    mutationFn: async (conversation: { 
      id: string; 
      session_id: string;
      remote_jid: string;
      is_group?: boolean;
    }) => {
      const { data: session } = await supabase
        .from("whatsapp_sessions")
        .select("id, provider")
        .eq("id", conversation.session_id)
        .maybeSingle();

      if (!session || session.provider !== "evolution_go") {
        throw new Error("Marcacao como lida esta disponivel apenas para Evolution Go.");
      }

      const { data: messages } = await supabase
        .from("whatsapp_messages")
        .select("message_id")
        .eq("conversation_id", conversation.id)
        .eq("from_me", false)
        .order("sent_at", { ascending: false })
        .limit(20);

      const messageIds = (messages || []).map((m: any) => m.message_id).filter(Boolean);
      await callEvolutionGo("message.markread", {
        session_id: conversation.session_id,
        body: {
          jid: conversation.remote_jid,
          messageIds,
        },
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: "Não foi possível marcar como lida no WhatsApp",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Mensagem marcada como lida no WhatsApp",
      });
    },
  });
}

export function useArchiveConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, archive }: { conversationId: string; archive: boolean }) => {
      const { error } = await (supabase as any)
        .from("whatsapp_conversations")
        .update({ 
          archived_at: archive ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
      toast({
        title: variables.archive ? "Conversa arquivada" : "Conversa desarquivada",
        description: variables.archive 
          ? "A conversa foi movida para o arquivo" 
          : "A conversa foi restaurada",
      });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await (supabase as any)
        .from("whatsapp_conversations")
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
      toast({
        title: "Conversa removida",
        description: "A conversa foi removida da lista",
      });
    },
  });
}

export function useLinkConversationToLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, leadId }: { conversationId: string; leadId: string }) => {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ lead_id: leadId })
        .eq("id", conversationId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conversation", variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
      toast({
        title: "Conversa vinculada",
        description: "A conversa foi vinculada ao lead",
      });
    },
  });
}

// Hook kept for backwards compatibility; realtime is now handled by
// WhatsAppRealtimeBus (mounted in AppLayout). This is a no-op so callers
// don't break.
export function useWhatsAppRealtimeConversations() {
  // intentionally empty
}


