import type { WhatsAppSession } from "@/hooks/use-whatsapp-sessions";
import { callEvolutionGo } from "@/hooks/use-evolution-go";
import { supabase } from "@/integrations/supabase/client";

type WhatsAppMediaType = "image" | "video" | "document" | "audio";

interface SendOptions {
  isGroup?: boolean;
  mentions?: string[];
}

interface WhatsAppSendResult {
  ok: boolean;
  data?: any;
  error?: string;
}

function normalizeGoResponse(result: any): WhatsAppSendResult {
  return { ok: !!result?.ok, data: result?.data, error: result?.error };
}

function normalizeLegacyResponse(result: any): WhatsAppSendResult {
  return { ok: !!result?.success, data: result?.data, error: result?.error };
}

function normalizeMimeType(mediatype: WhatsAppMediaType, mimetype: string) {
  if (mediatype === "document" && !mimetype) return "application/octet-stream";
  return mimetype || "application/octet-stream";
}

/**
 * Provider router: same operation, but routed to the correct backend
 * depending on session.provider.
 *
 * The goal is to keep all UI components provider-agnostic.
 */
export function getWhatsAppClient(session: Pick<WhatsAppSession, "provider" | "id" | "instance_name">) {
  const isGo = session.provider === "evolution_go";

  async function sendText(number: string, text: string, options: SendOptions = {}) {
    if (!isGo) {
      const { data, error } = await supabase.functions.invoke("evolution-proxy", {
        body: {
          action: "sendMessage",
          instanceName: session.instance_name,
          number,
          text,
          isGroup: options.isGroup,
          mentions: options.mentions || [],
        },
      });
      if (error) return { ok: false, error: error.message };
      return normalizeLegacyResponse(data);
    }
    const result = await callEvolutionGo("send.text", {
      session_id: session.id,
      body: { number, text, mentions: options.mentions || [] },
    });
    return normalizeGoResponse(result);
  }

  async function sendMedia(
    number: string,
    media: string,
    mediatype: WhatsAppMediaType,
    mimetype: string,
    fileName?: string,
    caption?: string,
    options: SendOptions = {},
  ) {
    if (!isGo) {
      const { data, error } = await supabase.functions.invoke("evolution-proxy", {
        body: {
          action: "sendFile",
          instanceName: session.instance_name,
          number,
          mediaUrl: media,
          base64: media.startsWith("data:") || /^[A-Za-z0-9+/=]+$/.test(media) ? media : undefined,
          path: media,
          mediaType: mediatype,
          mimetype,
          filename: fileName,
          caption,
          isGroup: options.isGroup,
          mentions: options.mentions || [],
        },
      });
      if (error) return { ok: false, error: error.message };
      return normalizeLegacyResponse(data);
    }
    const normalizedMimeType = normalizeMimeType(mediatype, mimetype);
    const base64Media = media.startsWith("data:") || /^[A-Za-z0-9+/=]+$/.test(media) ? media : undefined;
    const result = await callEvolutionGo(mediatype === "audio" ? "send.audio" : "send.media", {
      session_id: session.id,
      body: {
        number,
        type: mediatype,
        url: media,
        media,
        base64: base64Media,
        audio: mediatype === "audio" ? media : undefined,
        mediatype,
        mediaType: mediatype,
        mimetype: normalizedMimeType,
        fileName,
        filename: fileName,
        caption,
        mentions: options.mentions || [],
        mentionedJid: options.mentions || [],
      },
    });
    return normalizeGoResponse(result);
  }

  async function sendAudio(number: string, base64: string, mimetype = "audio/ogg") {
    return sendMedia(number, base64, "audio", mimetype);
  }

  return { sendText, sendMedia, sendAudio, isGo };
}
