// Evolution Go webhook receiver
// Handles: qrcode.updated, connection.update, messages.upsert, messages.update,
//          chats.upsert, labels.upsert, groups.upsert, contacts.upsert
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_KEY = Deno.env.get("EVOLUTION_GO_API_KEY") || "";
const EVOLUTION_GO_API_URL = (Deno.env.get("EVOLUTION_GO_API_URL") || "").replace(/\/+$/, "");
const VIMOB_BACKEND_URL = (Deno.env.get("VIMOB_BACKEND_URL") || "").replace(/\/+$/, "");
const VIMOB_BACKEND_WEBHOOK_SECRET = Deno.env.get("VIMOB_BACKEND_WEBHOOK_SECRET") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function runInBackground(work: Promise<any>) {
  // @ts-expect-error EdgeRuntime is provided by Supabase
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
  else work.catch((e) => console.error("background task error:", e));
}

async function mirrorMessageToGoBackend(input: {
  session: any;
  conversationId: string;
  messageId: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  text: string | null;
  payload: any;
}) {
  if (!VIMOB_BACKEND_URL || !input.messageId || !input.session?.organization_id) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (VIMOB_BACKEND_WEBHOOK_SECRET) {
      headers["X-Vimob-Webhook-Secret"] = VIMOB_BACKEND_WEBHOOK_SECRET;
    }

    const response = await fetch(`${VIMOB_BACKEND_URL}/v1/webhooks/whatsapp`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        organization_id: input.session.organization_id,
        conversation_id: input.conversationId,
        message_id: input.messageId,
        from: input.fromNumber,
        to: input.toNumber,
        text: input.text || "",
        payload: input.payload || {},
      }),
    });

    if (!response.ok) {
      console.warn("go backend mirror failed:", {
        status: response.status,
        conversation_id: input.conversationId,
        message_id: input.messageId,
      });
    }
  } catch (e) {
    console.warn("go backend mirror error:", e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timeout);
  }
}

/** Normalize Brazilian phone — strips non-digits, makes "55" optional matching */
async function triggerAutomationsForIncomingMessage(input: {
  session: any;
  conversation: any;
  message: string | null;
  contactPhone: string | null;
  contactName: string | null;
}) {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/automation-trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        event_type: "message_received",
        data: {
          session_id: input.session.id,
          conversation_id: input.conversation.id,
          lead_id: input.conversation.lead_id || null,
          message: input.message || "",
          contact_phone: input.contactPhone,
          contact_name: input.contactName,
        },
      }),
    });

    if (!response.ok) {
      console.error("automation-trigger error:", await response.text());
    }
  } catch (error) {
    console.error("automation-trigger call failed:", error);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function recoverAIAgentIfBackendSkipped(input: {
  session: any;
  conversation: any;
  message: string | null;
  contactName: string | null;
  receivedAt: string;
}) {
  if (!input.message) return;

  await sleep(15000);

  const { data: recentAIMessage } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("conversation_id", input.conversation.id)
    .eq("from_me", true)
    .gte("sent_at", input.receivedAt)
    .or("sender_name.ilike.%Jhenny%,sender_name.ilike.%Jenny%,sender_name.ilike.Automa%")
    .limit(1);

  if (recentAIMessage?.length) return;

  const { data: state } = await supabase
    .from("chatbot_conversation_state")
    .select("id, automation_enabled, agent_status")
    .eq("organization_id", input.session.organization_id)
    .eq("conversation_id", input.conversation.id)
    .maybeSingle();

  if (state?.automation_enabled !== false || state?.agent_status !== "handed_off_human") return;

  const { data: activeAgentConversation } = await supabase
    .from("ai_agent_conversations")
    .select("id")
    .eq("conversation_id", input.conversation.id)
    .eq("status", "active")
    .maybeSingle();

  if (!activeAgentConversation) return;

  await supabase
    .from("chatbot_conversation_state")
    .update({
      automation_enabled: true,
      agent_status: "active",
      last_response_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", input.session.organization_id)
    .eq("conversation_id", input.conversation.id);

  const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-agent-responder`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      conversation_id: input.conversation.id,
      session_id: input.session.id,
      organization_id: input.session.organization_id,
      message: input.message,
      contact_name: input.contactName,
    }),
  });

  if (!response.ok) {
    console.error("ai-agent-responder recovery error:", await response.text());
  }
}

function normalizePhone(jidOrNumber: string): string {
  return String(jidOrNumber || "").replace(/@.*/, "").replace(/:.*/, "").replace(/\D/g, "");
}

function phoneVariants(p: string): string[] {
  const digits = normalizePhone(p);
  const variants = new Set<string>([digits]);
  const withoutCountry = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  const local = withoutCountry.startsWith("0") && withoutCountry.length >= 11 ? withoutCountry.slice(1) : withoutCountry;

  if (local) {
    variants.add(withoutCountry);
    variants.add(local);
    variants.add(`55${local}`);
  }

  if (local.length === 11 && local[2] === "9") {
    const withoutNinthDigit = `${local.slice(0, 2)}${local.slice(3)}`;
    variants.add(withoutNinthDigit);
    variants.add(`55${withoutNinthDigit}`);
  }

  if (local.length === 10) {
    const withNinthDigit = `${local.slice(0, 2)}9${local.slice(2)}`;
    variants.add(withNinthDigit);
    variants.add(`55${withNinthDigit}`);
  }

  return Array.from(variants);
}

function phonesMatch(a: string, b: string): boolean {
  const aVariants = new Set(phoneVariants(a));
  const bVariants = phoneVariants(b);
  return bVariants.some((variant) => aVariants.has(variant));
}

function normalizeRemoteJid(jid: string): string {
  const raw = String(jid || "").trim();
  if (!raw || raw.endsWith("@g.us")) return raw;
  const [left, domain = "s.whatsapp.net"] = raw.split("@");
  const phone = left.split(":")[0].replace(/\D/g, "");
  return phone ? `${phone}@${domain === "c.us" ? "s.whatsapp.net" : domain}` : raw;
}

function isLidJid(jid: string): boolean {
  return String(jid || "").includes("@lid");
}

function isNewsletterJid(jid: string): boolean {
  return String(jid || "").includes("@newsletter");
}

function isRealContactJid(jid: string): boolean {
  const value = String(jid || "");
  return !isGroupJid(value) && !isLidJid(value) && !isNewsletterJid(value) && normalizePhone(value).length >= 10;
}

function isGroupJid(jid: string): boolean {
  return String(jid || "").endsWith("@g.us");
}

function hasPhoneDomain(jid: string): boolean {
  const value = String(jid || "");
  return value.endsWith("@s.whatsapp.net") || value.endsWith("@c.us");
}

function remoteJidVariants(jid: string): string[] {
  const normalized = normalizeRemoteJid(jid);
  if (normalized.endsWith("@g.us")) return [normalized];
  if (!isRealContactJid(normalized)) return Array.from(new Set([normalized, jid].filter(Boolean)));
  const phone = normalizePhone(normalized);
  const variants = phoneVariants(phone);
  const results: string[] = [];
  for (const variant of variants) {
    results.push(`${variant}@s.whatsapp.net`);
    results.push(`${variant}@c.us`);
  }
  results.push(normalized);
  results.push(jid);
  return Array.from(new Set(results.filter(Boolean)));
}

async function findLeadByPhone(organizationId: string, phone: string) {
  const variants = phoneVariants(phone).filter(Boolean);
  if (!organizationId || !variants.length) return null;

  const { data: directMatches, error } = await supabase
    .from("leads")
    .select("id, phone, name")
    .eq("organization_id", organizationId)
    .or(variants.map((v) => `phone.ilike.%${v}%`).join(","))
    .limit(20);

  if (error) {
    console.error("lead phone lookup error:", error);
    return null;
  }

  const directLead = (directMatches || []).find((lead: any) => phonesMatch(lead.phone || "", phone));
  if (directLead) return directLead;

  const tail = normalizePhone(phone).slice(-8);
  if (!tail) return null;

  const { data: tailMatches, error: tailError } = await supabase
    .from("leads")
    .select("id, phone, name")
    .eq("organization_id", organizationId)
    .ilike("phone", `%${tail}%`)
    .limit(10);

  if (tailError) {
    console.error("lead phone tail lookup error:", tailError);
    return null;
  }

  return (tailMatches || []).find((lead: any) => phonesMatch(lead.phone || "", phone)) || null;
}

function conversationMatchesPhone(conversation: any, phone: string): boolean {
  return phonesMatch(conversation?.contact_phone || conversation?.remote_jid || "", phone);
}

async function clearInvalidConversationLead(conversation: any, organizationId: string, phone: string) {
  if (!conversation?.lead_id || !organizationId || !phone) return true;

  const { data: linkedLead, error } = await supabase
    .from("leads")
    .select("id, phone")
    .eq("id", conversation.lead_id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[findOrCreateConversation] lead validation error:", error);
    return true;
  }

  if (linkedLead?.phone && phonesMatch(linkedLead.phone, phone)) return true;

  await supabase
    .from("whatsapp_conversations")
    .update({ lead_id: null, updated_at: new Date().toISOString() })
    .eq("id", conversation.id);
  conversation.lead_id = null;
  return false;
}

function getNested(obj: any, paths: string[]) {
  for (const path of paths) {
    const value = path.split(".").reduce((acc, key) => acc?.[key], obj);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function firstPresent(...values: any[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function cleanBase64(value: any): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const commaIndex = trimmed.indexOf(",");
  return trimmed.startsWith("data:") && commaIndex >= 0 ? trimmed.slice(commaIndex + 1) : trimmed;
}

function isLikelyBase64Image(value: string): boolean {
  const cleaned = cleanBase64(value) || value.trim();
  return cleaned.length > 120 && /^[A-Za-z0-9+/=_-]+$/.test(cleaned);
}

function normalizeAvatarValue(value: any): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:image/")) return trimmed;
  if (isLikelyBase64Image(trimmed)) return `data:image/jpeg;base64,${cleanBase64(trimmed) || trimmed}`;
  return null;
}

function extractAvatarFromPayload(...roots: any[]): string | null {
  const directPaths = [
    "profilePicture",
    "profile_picture",
    "profilePictureUrl",
    "profile_picture_url",
    "profilePic",
    "profilePicUrl",
    "picture",
    "pictureUrl",
    "photo",
    "photoUrl",
    "photo_url",
    "avatar",
    "avatarUrl",
    "avatar_url",
    "contactPicture",
    "contact_picture",
    "contactImage",
    "contact_image",
    "pushPicture",
    "senderPicture",
    "senderProfilePicture",
    "senderProfilePictureUrl",
    "data.profilePicture",
    "data.profilePictureUrl",
    "data.profilePicUrl",
    "data.picture",
    "data.pictureUrl",
    "data.avatar",
    "Data.ProfilePicture",
    "Data.ProfilePictureUrl",
    "Data.Picture",
    "Data.PictureUrl",
    "Info.ProfilePicture",
    "Info.ProfilePictureUrl",
    "info.profilePicture",
    "info.profilePictureUrl",
    "sender.profilePicture",
    "sender.profilePictureUrl",
    "contact.profilePicture",
    "contact.profilePictureUrl",
    "contact.picture",
    "contact.avatar",
    "profile.picture",
    "profile.avatar",
  ];

  for (const root of roots) {
    const direct = normalizeAvatarValue(getNested(root, directPaths));
    if (direct) return direct;
  }

  const visited = new Set<any>();
  const stack = roots.filter(Boolean).map((value) => ({ value, depth: 0, key: "" }));
  while (stack.length) {
    const item = stack.pop()!;
    if (!item.value || item.depth > 5) continue;
    if (typeof item.value === "object") {
      if (visited.has(item.value)) continue;
      visited.add(item.value);
      for (const [key, value] of Object.entries(item.value)) {
        const normalizedKey = key.toLowerCase();
        const isAvatarKey =
          normalizedKey.includes("avatar") ||
          normalizedKey.includes("picture") ||
          normalizedKey.includes("photo") ||
          normalizedKey.includes("profilepic") ||
          normalizedKey.includes("contactimage");
        if (isAvatarKey) {
          const avatar = normalizeAvatarValue(value);
          if (avatar) return avatar;
        }
        if (value && typeof value === "object") stack.push({ value, depth: item.depth + 1, key });
      }
    }
  }

  return null;
}

function collectAvatarLikeKeys(...roots: any[]): string[] {
  const keys = new Set<string>();
  const visited = new Set<any>();
  const stack = roots.filter(Boolean).map((value) => ({ value, depth: 0, path: "" }));
  while (stack.length) {
    const item = stack.pop()!;
    if (!item.value || typeof item.value !== "object" || item.depth > 5 || visited.has(item.value)) continue;
    visited.add(item.value);
    for (const [key, value] of Object.entries(item.value)) {
      const fullPath = item.path ? `${item.path}.${key}` : key;
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.includes("avatar") ||
        normalizedKey.includes("picture") ||
        normalizedKey.includes("photo") ||
        normalizedKey.includes("profilepic") ||
        normalizedKey.includes("contactimage")
      ) {
        keys.add(fullPath);
      }
      if (value && typeof value === "object") stack.push({ value, depth: item.depth + 1, path: fullPath });
    }
  }
  return Array.from(keys).slice(0, 30);
}

function chooseRemoteJid(m: any, info: any, key: any): string {
  const candidates = [
    info.Chat,
    info.chat,
    info.JID,
    info.jid,
    key.remoteJid,
    key.RemoteJid,
    key.remoteJID,
    m.remoteJid,
    m.remoteJID,
    m.chatId,
    m.Chat,
    m.jid,
    info.SenderAlt,
    info.senderAlt,
    info.RecipientAlt,
    info.recipientAlt,
    key.remoteJidAlt,
    key.RemoteJidAlt,
  ].filter(Boolean).map(String);

  const group = candidates.find(isGroupJid);
  if (group) return group;

  const phoneJid = candidates.find((jid) => hasPhoneDomain(jid) && !isLidJid(jid) && normalizePhone(jid).length >= 10);
  if (phoneJid) return phoneJid;

  const nonLid = candidates.find((jid) => !isLidJid(jid) && normalizePhone(jid).length >= 10);
  if (nonLid) return nonLid;

  return candidates[0] || "";
}

function extractMediaBase64(root: any, msg: any, media: any): string | null {
  return cleanBase64(firstPresent(
    media?.base64,
    media?.Base64,
    msg?.base64,
    msg?.Base64,
    root?.base64,
    root?.Base64,
    root?.data?.base64,
    root?.Data?.Base64,
    root?.message?.base64,
    root?.Message?.base64,
    root?.Message?.Base64,
  ));
}

function extractMediaUrl(root: any, msg: any, media: any): string | null {
  const value = firstPresent(
    media?.mediaUrl,
    media?.MediaUrl,
    media?.mediaURL,
    media?.url,
    media?.URL,
    media?.Url,
    msg?.mediaUrl,
    msg?.MediaUrl,
    msg?.mediaURL,
    root?.mediaUrl,
    root?.MediaUrl,
    root?.mediaURL,
    root?.data?.mediaUrl,
    root?.Data?.MediaUrl,
    root?.Message?.mediaUrl,
    root?.Message?.MediaUrl,
  );
  if (!value || typeof value !== "string") return null;
  if (value.includes("mmg.whatsapp.net") || value.includes("pps.whatsapp.net") || value.includes(".enc")) return null;
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:")) return value;
  return null;
}

function normalizeMediaPayload(media: any) {
  if (!media || typeof media !== "object") return null;
  return {
    ...media,
    url: firstPresent(media.url, media.URL, media.Url, media.mediaUrl, media.MediaUrl),
    directPath: firstPresent(media.directPath, media.DirectPath),
    mediaKey: firstPresent(media.mediaKey, media.MediaKey),
    fileSHA256: firstPresent(media.fileSHA256, media.FileSHA256, media.fileSha256),
    fileEncSHA256: firstPresent(media.fileEncSHA256, media.FileEncSHA256, media.fileEncSha256),
    fileLength: firstPresent(media.fileLength, media.FileLength),
    mimetype: firstPresent(media.mimetype, media.Mimetype),
  };
}

function extractReactionTargetId(reaction: any): string | null {
  return firstPresent(
    reaction?.key?.id,
    reaction?.key?.ID,
    reaction?.Key?.ID,
    reaction?.messageKey?.id,
    reaction?.messageKey?.ID,
    reaction?.MessageKey?.ID,
    reaction?.targetMessageId,
    reaction?.TargetMessageID,
    reaction?.messageId,
    reaction?.MessageID,
    reaction?.id,
    reaction?.ID,
  ) || null;
}

async function evolutionGoFetch(session: any, path: string, body: any) {
  if (!EVOLUTION_GO_API_URL || !API_KEY) return null;
  const token = session?.advanced_settings?.token && session.advanced_settings.token !== "default_token"
    ? session.advanced_settings.token
    : API_KEY;
  const instanceKeys = Array.from(new Set([session.instance_name, session.instance_id].filter(Boolean)));
  for (const instanceKey of instanceKeys) {
    for (const payload of Array.isArray(body) ? body : [body]) {
      try {
        const url = new URL(`${EVOLUTION_GO_API_URL}${path}`);
        if (path !== "/user/avatar") url.searchParams.set("instanceId", instanceKey);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort("timeout"), path === "/user/avatar" ? 30000 : 5000);
        const response = await fetch(url.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": token,
            ...(path === "/user/avatar" ? {} : { "instanceId": instanceKey }),
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (response.ok) return await response.json().catch(() => null);
      } catch (e) {
        console.warn("evolution go fetch failed:", path, e);
      }
    }
    try {
      const url = new URL(`${EVOLUTION_GO_API_URL}${path}`);
      if (path !== "/user/avatar") url.searchParams.set("instanceId", instanceKey);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort("timeout"), path === "/user/avatar" ? 30000 : 5000);
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": token,
          ...(path === "/user/avatar" ? {} : { "instanceId": instanceKey }),
        },
        body: JSON.stringify(Array.isArray(body) ? body[0] : body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (response.ok) return await response.json().catch(() => null);
    } catch (e) {
      console.warn("evolution go fetch failed:", path, e);
    }
  }
  return null;
}

async function fetchGroupMetadata(session: any, groupJid: string) {
  if (!groupJid.endsWith("@g.us")) return null;
  const data = await evolutionGoFetch(session, "/group/info", [
    { groupJid },
    { jid: groupJid },
    { id: groupJid },
  ]);
  const target = data?.data || data?.group || data;
  if (!target) return null;
  return {
    subject: getNested(target, ["subject", "Subject", "name", "Name", "groupName", "GroupName", "data.subject", "data.name"]),
    pictureUrl: getNested(target, ["pictureUrl", "PictureUrl", "picture_url", "profilePictureUrl", "ProfilePictureUrl", "avatar", "Avatar", "URL", "Url", "url", "data.pictureUrl", "data.profilePictureUrl", "data.URL", "data.Url", "data.url"]),
    description: getNested(target, ["desc", "description", "Description", "data.desc", "data.description"]),
    participants: target.participants || target.Participants || target.data?.participants || [],
    owner: target.owner || target.Owner || target.data?.owner || null,
  };
}

async function resolveGroupMetadata(session: any, groupJid: string) {
  if (!isGroupJid(groupJid)) return null;

  const { data: existing } = await supabase
    .from("whatsapp_groups")
    .select("subject, picture_url, description, participants, owner_jid")
    .eq("session_id", session.id)
    .eq("group_jid", groupJid)
    .maybeSingle();

  if (existing?.subject) {
    return {
      subject: existing.subject,
      pictureUrl: existing.picture_url || null,
      description: existing.description || null,
      participants: existing.participants || [],
      owner: existing.owner_jid || null,
    };
  }

  return await fetchGroupMetadata(session, groupJid);
}

async function findOrCreateConversation(
  sessionId: string,
  organizationId: string,
  remoteJid: string,
  contactName?: string,
  contactPicture?: string | null,
  groupMeta?: any,
) {
  const canonicalJid = normalizeRemoteJid(remoteJid);
  const hasRealPhone = isRealContactJid(canonicalJid);
  const phone = hasRealPhone ? normalizePhone(canonicalJid) : "";
  const isGroup = canonicalJid.endsWith("@g.us");

  const { data: convs } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .in("remote_jid", remoteJidVariants(remoteJid));

  const conv = (convs || []).find((c: any) => c.lead_id) || (convs || []).find((c: any) => c.session_id === sessionId) || (convs || [])[0];
  if (conv) {
    const leadStillValid = !isGroup && phone
      ? await clearInvalidConversationLead(conv, organizationId, phone)
      : true;

    const update: any = {};
    // Se a conversa veio de uma session diferente (session mudou por reconexão),
    // migrar para a nova session automaticamente
    if (conv.session_id !== sessionId) {
      update.session_id = sessionId;
      console.log(`[findOrCreateConversation] Migrando conversa ${conv.id} da session ${conv.session_id} para ${sessionId}`);
    }
    if (groupMeta?.subject && conv.contact_name !== groupMeta.subject) update.contact_name = groupMeta.subject;
    if (groupMeta?.pictureUrl && !conv.contact_picture) update.contact_picture = groupMeta.pictureUrl;
    if (!isGroup && contactPicture && !conv.contact_picture) update.contact_picture = contactPicture;
    if (!isGroup && contactName && (!conv.contact_name || !leadStillValid)) update.contact_name = contactName;
    if (!isGroup && !conv.lead_id && phone) {
      const lead = await findLeadByPhone(organizationId, phone);
      if (lead?.id) {
        update.lead_id = lead.id;
        if (lead.name && (!conv.contact_name || conv.contact_name === conv.contact_phone || conv.contact_name === contactName)) {
          update.contact_name = lead.name;
        }
      }
    }
    if (Object.keys(update).length) {
      await supabase.from("whatsapp_conversations").update(update).eq("id", conv.id);
      Object.assign(conv, update);
    }
  }
  if (conv) return conv;

  if (!isGroup && !isLidJid(canonicalJid) && contactName) {
    const { data: lidMatches } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_group", false)
      .eq("contact_name", contactName)
      .is("deleted_at", null)
      .is("lead_id", null)
      .limit(5);

    const lidConversation = (lidMatches || []).find((c: any) => isLidJid(String(c.remote_jid || "")));
    if (lidConversation) {
      const update: any = {
        remote_jid: canonicalJid,
        contact_phone: phone,
      };
      if (contactPicture && !lidConversation.contact_picture) update.contact_picture = contactPicture;
      await supabase.from("whatsapp_conversations").update(update).eq("id", lidConversation.id);
      Object.assign(lidConversation, update);
      return lidConversation;
    }
  }

  let leadId: string | null = null;
  let leadName: string | null = null;
  if (!isGroup && hasRealPhone) {
    const lead = await findLeadByPhone(organizationId, phone);
    if (lead?.id) {
      leadId = lead.id;
      leadName = lead.name || null;
    }
  }

  if (!isGroup && (leadId || hasRealPhone)) {
    let canonicalConversation: any = null;

    if (leadId) {
      const { data: leadConversation } = await supabase
        .from("whatsapp_conversations")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_group", false)
        .eq("lead_id", leadId)
        .is("deleted_at", null)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      canonicalConversation = leadConversation && conversationMatchesPhone(leadConversation, phone)
        ? leadConversation
        : null;
    }

    if (!canonicalConversation && hasRealPhone) {
      const variants = phoneVariants(phone);
      const remoteVariants = variants.flatMap((variant) => [
        `${variant}@s.whatsapp.net`,
        `${variant}@c.us`,
      ]);

      const { data: phoneMatches } = await supabase
        .from("whatsapp_conversations")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_group", false)
        .is("deleted_at", null)
        .or(`contact_phone.in.(${variants.join(",")}),remote_jid.in.(${remoteVariants.join(",")})`)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(10);

      canonicalConversation = (phoneMatches || []).find((candidate: any) =>
        phonesMatch(candidate.contact_phone || candidate.remote_jid || "", phone)
      ) || null;
    }

    if (canonicalConversation) {
      const update: any = {};
      if (canonicalConversation.session_id !== sessionId) update.session_id = sessionId;
      if (hasRealPhone && canonicalConversation.remote_jid !== canonicalJid) update.remote_jid = canonicalJid;
      if (hasRealPhone && !canonicalConversation.contact_phone) update.contact_phone = phone;
      if (leadId && !canonicalConversation.lead_id) update.lead_id = leadId;
      if (leadName && (!canonicalConversation.contact_name || canonicalConversation.contact_name === canonicalConversation.contact_phone || canonicalConversation.contact_name === contactName)) {
        update.contact_name = leadName;
      } else if (contactName && !canonicalConversation.contact_name) {
        update.contact_name = contactName;
      }
      if (contactPicture && !canonicalConversation.contact_picture) update.contact_picture = contactPicture;

      if (Object.keys(update).length) {
        const { error: canonicalUpdateError } = await supabase
          .from("whatsapp_conversations")
          .update(update)
          .eq("id", canonicalConversation.id);

        if (canonicalUpdateError) {
          console.error("[findOrCreateConversation] canonical conversation update error:", canonicalUpdateError);
        } else {
          Object.assign(canonicalConversation, update);
        }
      }

      return canonicalConversation;
    }
  }

  const { data: created, error } = await supabase
    .from("whatsapp_conversations")
    .insert({
      session_id: sessionId,
      organization_id: organizationId,
      remote_jid: canonicalJid,
      contact_name: isGroup ? (groupMeta?.subject || contactName || canonicalJid) : (leadName || contactName || null),
      contact_phone: isGroup || !hasRealPhone ? null : phone,
      contact_picture: contactPicture || groupMeta?.pictureUrl || null,
      is_group: isGroup,
      lead_id: leadId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return created;
}

function getMessageList(event: any): any[] {
  const data = event?.data || event?.Data;
  if (data?.Info || data?.info) return [data];
  if (event?.Info || event?.info) return [event];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.messages)) return data.messages;
  if (Array.isArray(data?.Messages)) return data.Messages;
  if (Array.isArray(data?.message)) return data.message;
  if (Array.isArray(data?.Message)) return data.Message;
  if (Array.isArray(event?.messages)) return event.messages;
  if (Array.isArray(event?.Messages)) return event.Messages;
  if (Array.isArray(event?.message)) return event.message;
  return [data?.message || data?.Message || event?.message || event?.Message || data || event].filter(Boolean);
}

function unwrapMessagePayload(m: any) {
  return m?.message || m?.Message || m?.msg || m?.content || m;
}

function collectMessageIds(...items: any[]): string[] {
  const ids = new Set<string>();
  const add = (value: any) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }
    if (typeof value === "object") {
      add(value.id || value.ID || value.Id || value.messageId || value.MessageID || value.MessageId);
      add(value.key || value.Key);
      return;
    }
    ids.add(String(value));
  };

  for (const item of items) {
    add(item?.key?.id);
    add(item?.Key?.ID);
    add(item?.Key?.Id);
    add(item?.Info?.ID);
    add(item?.Info?.Id);
    add(item?.info?.ID);
    add(item?.info?.id);
    add(item?.id);
    add(item?.ID);
    add(item?.Id);
    add(item?.messageId);
    add(item?.MessageID);
    add(item?.MessageId);
    add(item?.messageIds);
    add(item?.MessageIDs);
    add(item?.MessageIds);
    add(item?.messagesIds);
    add(item?.MessagesIDs);
    add(item?.ids);
    add(item?.IDs);
    add(item?.receipt?.messageIds);
    add(item?.Receipt?.MessageIDs);
    add(item?.data?.messageIds);
    add(item?.Data?.MessageIDs);
  }

  return Array.from(ids).filter(Boolean);
}

function receiptStatus(item: any, event: any) {
  const raw = String(
    event?.state ||
    event?.State ||
    item?.status ||
    item?.Status ||
    item?.update?.status ||
    item?.Update?.Status ||
    item?.messageStatus ||
    item?.MessageStatus ||
    item?.receiptType ||
    item?.ReceiptType ||
    item?.type ||
    item?.Type ||
    item?.Info?.Status ||
    item?.info?.Status ||
    item?.Receipt?.Type ||
    item?.receipt?.type ||
    event?.data?.Receipt?.Type ||
    event?.data?.receipt?.type ||
    event?.event ||
    event?.type ||
    "",
  ).toLowerCase();
  const numeric = Number(item?.status ?? item?.Status ?? item?.messageStatus ?? item?.MessageStatus);
  if (raw.includes("read") || raw.includes("played") || numeric >= 4) return "read";
  if (raw.includes("deliver") || raw.includes("server_ack") || numeric === 3) return "delivered";
  if (raw.includes("sent") || numeric === 2) return "sent";
  return "";
}

async function fetchAvatarUrl(session: any, remoteJid: string) {
  if (!EVOLUTION_GO_API_URL || !API_KEY || remoteJid.endsWith("@g.us")) return null;
  const number = normalizePhone(remoteJid);
  const localNumber = number.startsWith("55") && number.length > 11 ? number.slice(2) : number;
  const data = await evolutionGoFetch(session, "/user/avatar", [
    { number, preview: true },
    { number, preview: false },
    ...(localNumber !== number ? [{ number: localNumber, preview: true }] : []),
    ...(localNumber !== number ? [{ number: localNumber, preview: false }] : []),
  ]);
  const avatar =
    data?.URL ||
    data?.Url ||
    data?.url ||
    data?.avatar ||
    data?.picture ||
    data?.pictureUrl ||
    data?.profilePictureUrl ||
    data?.data?.URL ||
    data?.data?.Url ||
    data?.data?.url ||
    data?.data?.avatar ||
    data?.data?.picture ||
    data?.data?.pictureUrl ||
    data?.data?.profilePictureUrl ||
    null;
  if (!avatar || typeof avatar !== "string") return null;
  if (/^https?:\/\//i.test(avatar) || avatar.startsWith("data:")) return avatar;
  return `data:image/jpeg;base64,${avatar}`;
}

async function storeAvatar(
  organizationId: string,
  sessionId: string,
  ownerId: string,
  rawAvatar: string,
): Promise<string | null> {
  const normalized = normalizeAvatarValue(rawAvatar);
  if (!normalized) return null;

  let contentType = "image/jpeg";
  let bytes: Uint8Array | null = null;

  if (/^https?:\/\//i.test(normalized)) {
    if (normalized.includes("/storage/v1/object/public/")) return normalized;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort("timeout"), 12000);
      const response = await fetch(normalized, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) return normalized;
      contentType = response.headers.get("content-type") || contentType;
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      console.warn("avatar remote download failed:", {
        ownerId,
        error: error instanceof Error ? error.message : String(error),
      });
      return normalized;
    }
  } else if (normalized.startsWith("data:")) {
    const match = normalized.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) return normalized;
    contentType = match[1] || contentType;
    bytes = Uint8Array.from(atob(match[2] || ""), (c) => c.charCodeAt(0));
  }

  if (!bytes || bytes.length < 50) return normalized;

  const safeOwnerId = String(ownerId || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "");
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const path = `orgs/${organizationId}/sessions/${sessionId}/avatars/${safeOwnerId}.${ext}`;
  const { error } = await supabase.storage
    .from("whatsapp-media")
    .upload(path, bytes, { contentType, upsert: true });

  if (error) {
    console.error("avatar upload error:", error, { ownerId, contentType });
    return normalized;
  }

  const { data } = supabase.storage.from("whatsapp-media").getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

async function updateLeadsAvatarForConversation(session: any, conv: any, remoteJid: string, avatarUrl: string) {
  const now = new Date().toISOString();
  if (conv.lead_id) {
    await supabase
      .from("leads")
      .update({ whatsapp_avatar_url: avatarUrl, whatsapp_avatar_synced_at: now })
      .eq("id", conv.lead_id);
    return;
  }

  const variants = phoneVariants(normalizePhone(remoteJid));
  if (!variants.length) return;

  const { data: leads } = await supabase
    .from("leads")
    .select("id")
    .eq("organization_id", session.organization_id)
    .or(variants.map((v) => `phone.ilike.%${v}%`).join(","))
    .limit(10);

  for (const lead of leads || []) {
    await supabase
      .from("leads")
      .update({ whatsapp_avatar_url: avatarUrl, whatsapp_avatar_synced_at: now })
      .eq("id", lead.id);
  }
}

async function persistConversationAvatar(session: any, conv: any, remoteJid: string, rawAvatar: string | null) {
  if (!rawAvatar || !conv?.id || isGroupJid(remoteJid)) return null;
  const ownerId = normalizePhone(remoteJid) || conv.id;
  const avatarUrl = await storeAvatar(session.organization_id, session.id, ownerId, rawAvatar);
  if (!avatarUrl) return null;

  await supabase
    .from("whatsapp_conversations")
    .update({ contact_picture: avatarUrl, updated_at: new Date().toISOString() })
    .eq("id", conv.id);

  Object.assign(conv, { contact_picture: avatarUrl });
  await updateLeadsAvatarForConversation(session, conv, remoteJid, avatarUrl);
  return avatarUrl;
}

async function refreshConversationAvatar(session: any, conv: any, remoteJid: string) {
  if (!conv?.id || conv.contact_picture || isGroupJid(remoteJid)) return;
  const rawAvatarUrl = await fetchAvatarUrl(session, remoteJid);
  if (!rawAvatarUrl) return;
  const avatarUrl = await storeAvatar(session.organization_id, session.id, normalizePhone(remoteJid) || conv.id, rawAvatarUrl);
  if (!avatarUrl) return;

  await supabase
    .from("whatsapp_conversations")
    .update({ contact_picture: avatarUrl, updated_at: new Date().toISOString() })
    .eq("id", conv.id)
    .or("contact_picture.is.null,contact_picture.eq.");

  if (conv.lead_id) {
    await supabase
      .from("leads")
      .update({
        whatsapp_avatar_url: avatarUrl,
        whatsapp_avatar_synced_at: new Date().toISOString(),
      })
      .eq("id", conv.lead_id);
    return;
  }

  const variants = phoneVariants(normalizePhone(remoteJid));
  if (!variants.length) return;

  const { data: leads } = await supabase
    .from("leads")
    .select("id")
    .eq("organization_id", session.organization_id)
    .or(variants.map((v) => `phone.ilike.%${v}%`).join(","))
    .limit(10);

  for (const lead of leads || []) {
    await supabase
      .from("leads")
      .update({
        whatsapp_avatar_url: avatarUrl,
        whatsapp_avatar_synced_at: new Date().toISOString(),
      })
      .eq("id", lead.id);
  }
}

function formatLastMessagePreview(
  messageType: string,
  content: string | null,
  fromMe: boolean,
  senderName: string | null,
  isGroup: boolean,
) {
  if (messageType === "text") return content || "";
  if (messageType === "reaction") return content || "";

  const mediaLabels: Record<string, { article: string; noun: string }> = {
    image: { article: "uma", noun: "imagem" },
    video: { article: "um", noun: "vídeo" },
    audio: { article: "um", noun: "áudio" },
    document: { article: "um", noun: "documento" },
    sticker: { article: "uma", noun: "figurinha" },
  };
  const label = mediaLabels[messageType] || { article: "uma", noun: "mídia" };
  const actor = fromMe
    ? (isGroup && senderName ? senderName : "Você")
    : (isGroup ? (senderName || "Alguém") : (senderName || "Contato"));

  return `${actor} enviou ${label.article} ${label.noun}`;
}

async function handleSingleMessageUpsert(session: any, m: any) {
  const info = m.Info || m.info || {};
  const key = m.key || m.Key || {};
  const rawRemoteJid = chooseRemoteJid(m, info, key);
  const remoteJid = normalizeRemoteJid(rawRemoteJid);
  if (!remoteJid) return;

  const fromMe = !!(key.fromMe ?? key.FromMe ?? info.IsFromMe ?? info.isFromMe ?? m.fromMe);
  const messageId = key.id || key.ID || info.ID || info.Id || m.id || m.ID || m.messageId;
  const timestamp = m.messageTimestamp || m.MessageTimestamp || m.timestamp || m.Timestamp || info.Timestamp || Date.now();
  const sentAt = new Date(typeof timestamp === "number" && timestamp < 1e12 ? timestamp * 1000 : timestamp).toISOString();
  const senderName = m.pushName || m.PushName || info.PushName || m.senderName || null;

  // Extract content + type
  let content: string | null = null;
  let messageType = "text";
  let mediaMimeType: string | null = null;
  let mediaBase64: string | null = null;
  let mediaExternalUrl: string | null = null;
  let mediaPayload: any = null;
  let reactionToMessageId: string | null = null;
  let reactionEmoji: string | null = null;

  const msg = unwrapMessagePayload(m);
  if (msg.conversation || msg.Conversation) {
    content = msg.conversation || msg.Conversation;
    messageType = "text";
  } else if (msg.extendedTextMessage?.text || msg.ExtendedTextMessage?.Text) {
    content = msg.extendedTextMessage?.text || msg.ExtendedTextMessage?.Text;
    messageType = "text";
  } else if (msg.imageMessage || msg.ImageMessage) {
    const image = msg.imageMessage || msg.ImageMessage;
    mediaPayload = normalizeMediaPayload(image);
    messageType = "image";
    content = image.caption || image.Caption || "[Imagem]";
    mediaMimeType = image.mimetype || image.Mimetype || "image/jpeg";
    mediaBase64 = extractMediaBase64(m, msg, image);
    mediaExternalUrl = extractMediaUrl(m, msg, image);
  } else if (msg.videoMessage || msg.VideoMessage) {
    const video = msg.videoMessage || msg.VideoMessage;
    mediaPayload = normalizeMediaPayload(video);
    messageType = "video";
    content = video.caption || video.Caption || "[Video]";
    mediaMimeType = video.mimetype || video.Mimetype || "video/mp4";
    mediaBase64 = extractMediaBase64(m, msg, video);
    mediaExternalUrl = extractMediaUrl(m, msg, video);
  } else if (msg.audioMessage || msg.AudioMessage) {
    const audio = msg.audioMessage || msg.AudioMessage;
    mediaPayload = normalizeMediaPayload(audio);
    messageType = "audio";
    content = audio.ptt || audio.PTT ? "[Audio]" : "[Gravacao]";
    mediaMimeType = audio.mimetype || audio.Mimetype || "audio/ogg";
    mediaBase64 = extractMediaBase64(m, msg, audio);
    mediaExternalUrl = extractMediaUrl(m, msg, audio);
  } else if (msg.documentMessage || msg.DocumentMessage) {
    const doc = msg.documentMessage || msg.DocumentMessage;
    mediaPayload = normalizeMediaPayload(doc);
    messageType = "document";
    content = doc.fileName || doc.FileName || "[Documento]";
    mediaMimeType = doc.mimetype || doc.Mimetype || "application/octet-stream";
    mediaBase64 = extractMediaBase64(m, msg, doc);
    mediaExternalUrl = extractMediaUrl(m, msg, doc);
  } else if (msg.stickerMessage || msg.StickerMessage) {
    const sticker = msg.stickerMessage || msg.StickerMessage;
    mediaPayload = normalizeMediaPayload(sticker);
    messageType = "sticker";
    content = "[Figurinha]";
    mediaMimeType = sticker.mimetype || sticker.Mimetype || "image/webp";
    mediaBase64 = extractMediaBase64(m, msg, sticker);
    mediaExternalUrl = extractMediaUrl(m, msg, sticker);
  } else if (msg.reactionMessage || msg.ReactionMessage) {
    const reaction = msg.reactionMessage || msg.ReactionMessage;
    messageType = "reaction";
    reactionEmoji = reaction.text || reaction.Text || reaction.emoji || reaction.Emoji || "";
    reactionToMessageId = extractReactionTargetId(reaction);
    content = reactionEmoji || "[Reacao]";
  }

  const isGroup = remoteJid.endsWith("@g.us");
  const groupMeta = isGroup ? await resolveGroupMetadata(session, remoteJid) : null;
  const incomingAvatar = !isGroup ? extractAvatarFromPayload(m, msg, info, key) : null;
  const avatarPayloadKeys = !isGroup ? collectAvatarLikeKeys(m, msg, info, key) : [];

  if (fromMe && messageId) {
    const { data: existingOutgoing } = await supabase
      .from("whatsapp_messages")
      .select("id, conversation_id, status, conversation:whatsapp_conversations!inner(organization_id)")
      .eq("message_id", messageId)
      .eq("from_me", true)
      .eq("conversation.organization_id", session.organization_id)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingOutgoing?.id) {
      await supabase
        .from("whatsapp_messages")
        .update({
          status: existingOutgoing.status === "read" ? "read" : "delivered",
          remote_jid: isRealContactJid(remoteJid) ? remoteJid : undefined,
        })
        .eq("id", existingOutgoing.id);
      return;
    }

    if (!isGroup && !isRealContactJid(remoteJid)) {
      console.warn("[evolution-go-webhook] Ignoring outgoing callback without stable contact identity", {
        session_id: session.id,
        message_id: messageId,
        remote_jid: remoteJid,
      });
      return;
    }
  }

  const conv = await findOrCreateConversation(
    session.id,
    session.organization_id,
    remoteJid,
    isGroup ? (groupMeta?.subject || remoteJid) : (!fromMe ? (senderName || undefined) : undefined),
    null,
    groupMeta,
  );

  if (!isGroup && fromMe && senderName && conv.contact_name === senderName && !conv.lead_id) {
    await supabase
      .from("whatsapp_conversations")
      .update({ contact_name: null, updated_at: new Date().toISOString() })
      .eq("id", conv.id);
    Object.assign(conv, { contact_name: null });
  }

  const avatarUrl = await persistConversationAvatar(session, conv, remoteJid, incomingAvatar);

  if (!isGroup && !conv.contact_picture) {
    runInBackground(refreshConversationAvatar(session, conv, remoteJid));
  }

  if (isGroup && groupMeta) {
    await supabase.from("whatsapp_groups").upsert({
      session_id: session.id,
      organization_id: session.organization_id,
      group_jid: remoteJid,
      subject: groupMeta.subject || conv.contact_name || null,
      description: groupMeta.description || null,
      picture_url: groupMeta.pictureUrl || null,
      participants: groupMeta.participants || [],
      owner_jid: groupMeta.owner || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "session_id,group_jid" });

    const convUpdate: any = {};
    if (groupMeta.subject && conv.contact_name !== groupMeta.subject) convUpdate.contact_name = groupMeta.subject;
    if (avatarUrl) {
      convUpdate.contact_picture = avatarUrl;
    } else if (groupMeta.pictureUrl && !conv.contact_picture) {
      convUpdate.contact_picture = groupMeta.pictureUrl;
    }
    if (Object.keys(convUpdate).length) {
      await supabase.from("whatsapp_conversations").update(convUpdate).eq("id", conv.id);
      Object.assign(conv, convUpdate);
    }
  }

  // Dedupe by message_id
  if (messageId) {
    const { data: existing } = await supabase
      .from("whatsapp_messages")
      .select("id")
      .eq("conversation_id", conv.id)
      .eq("message_id", messageId)
      .maybeSingle();
    if (existing) return;
  }

  const senderJid = key.participant || key.Participant || info.Sender || info.sender || m.participant || null;
  const storedMediaExternalUrl = messageType === "sticker" ? null : mediaExternalUrl;
  const messageInsert: any = {
    conversation_id: conv.id,
    session_id: session.id,
    message_id: messageId,
    content,
    message_type: messageType,
    media_url: storedMediaExternalUrl,
    media_mime_type: mediaMimeType,
    media_status: storedMediaExternalUrl ? "ready" : (mediaBase64 ? "pending" : (["image", "video", "audio", "document", "sticker"].includes(messageType) ? "pending" : null)),
    from_me: fromMe,
    status: fromMe ? "sent" : "delivered",
    sent_at: sentAt,
    remote_jid: remoteJid,
    sender_jid: senderJid,
    sender_name: senderName,
    reaction_to_message_id: reactionToMessageId,
    reaction_emoji: messageType === "reaction" ? reactionEmoji || content : null,
    reaction_sender_jid: messageType === "reaction" ? senderJid : null,
    reaction_sender_name: messageType === "reaction" ? senderName : null,
    metadata: {
      provider: "evolution_go",
      raw_remote_jid: rawRemoteJid,
      used_lid_fallback: isLidJid(String(rawRemoteJid)) && !isLidJid(remoteJid),
      avatar_payload_found: !!incomingAvatar,
      avatar_payload_saved: !!avatarUrl,
      avatar_payload_keys: avatarPayloadKeys,
      reaction_to_message_id: reactionToMessageId,
      media_external_url: mediaExternalUrl,
      media_payload: mediaPayload,
    },
  };

  const { data: inserted, error } = await supabase
    .from("whatsapp_messages")
    .insert(messageInsert)
    .select("id")
    .single();

  if (error) {
    console.error("insert message error:", error);
    return;
  }

  if (!fromMe && messageId) {
    runInBackground(mirrorMessageToGoBackend({
      session,
      conversationId: conv.id,
      messageId,
      fromNumber: normalizePhone(senderJid || remoteJid),
      toNumber: normalizePhone(session.phone_number || session.instance_name || ""),
      text: content,
      payload: {
        provider: "evolution_go",
        session_id: session.id,
        conversation_id: conv.id,
        whatsapp_message_id: inserted.id,
        remote_jid: remoteJid,
        sender_jid: senderJid,
        sender_name: senderName,
        message_type: messageType,
        media_mime_type: mediaMimeType,
        media_status: messageInsert.media_status,
        reaction_to_message_id: reactionToMessageId,
        sent_at: sentAt,
        raw_message: m,
      },
    }));
  }

  if (!fromMe && !isGroup) {
    runInBackground(triggerAutomationsForIncomingMessage({
      session,
      conversation: conv,
      message: content,
      contactPhone: normalizePhone(remoteJid),
      contactName: senderName,
    }));

    if (messageType === "text" && content) {
      runInBackground(recoverAIAgentIfBackendSkipped({
        session,
        conversation: conv,
        message: content,
        contactName: senderName,
        receivedAt: sentAt,
      }));
    }
  }

  // If we got base64 media, hand off to media-worker via storage
  let storedInlineMedia = false;
  if (mediaBase64 && inserted) {
    try {
      const bytes = Uint8Array.from(atob(mediaBase64), (c) => c.charCodeAt(0));
      const ext = (mediaMimeType?.split("/")?.[1] || "bin").split(";")[0];
      const path = `orgs/${session.organization_id}/sessions/${session.id}/media/${inserted.id}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("whatsapp-media")
        .upload(path, bytes, { contentType: mediaMimeType?.split(";")[0] || "application/octet-stream", upsert: true });
      if (!upErr) {
        await supabase.from("whatsapp_messages").update({
          media_url: null,
          media_storage_path: path,
          media_status: "ready",
          media_size: bytes.length,
        }).eq("id", inserted.id);
        storedInlineMedia = true;
      } else {
        console.error("media upload storage error:", upErr, {
          inserted_id: inserted.id,
          message_type: messageType,
          media_mime_type: mediaMimeType,
        });
      }
    } catch (e) {
      console.error("media upload error:", e);
    }
  }

  if (!storedMediaExternalUrl && !storedInlineMedia && inserted && ["image", "video", "audio", "document", "sticker"].includes(messageType)) {
    const { data: alreadyReady } = await supabase
      .from("whatsapp_messages")
      .select("media_status")
      .eq("id", inserted.id)
      .eq("media_status", "ready")
      .maybeSingle();
    if (alreadyReady) return;

    const { data: job, error: jobError } = await supabase.from("media_jobs").insert({
      organization_id: session.organization_id,
      session_id: session.id,
      conversation_id: conv.id,
      message_id: inserted.id,
      message_key: {
        id: messageId,        // ← adicionado
        message_id: messageId,
        remote_jid: remoteJid,
        sender_jid: senderJid,
        key,
        info,
        media: mediaPayload,
        raw_message: m,
      },
      media_type: messageType,
      media_mime_type: mediaMimeType,
      status: "pending",
      attempts: 0,
      max_attempts: 5,
      next_retry_at: new Date().toISOString(),
    }).select("id").single();
    if (jobError) {
      console.error("media job insert error:", jobError, {
        message_id: messageId,
        inserted_id: inserted.id,
        message_type: messageType,
        has_media_payload: !!mediaPayload,
      });
    } else if (job?.id) {
      EdgeRuntime.waitUntil(fetch(`${SUPABASE_URL}/functions/v1/media-worker`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ message_id: inserted.id, force: true }),
      }).catch((e) => console.error("media worker trigger error:", e)));
    }
  }

  // Reactions are rendered under the original message, so they should not move
  // the conversation or create noisy unread counts.
  if (messageType !== "reaction") {
    const lastMessage = formatLastMessagePreview(messageType, content, fromMe, senderName, isGroup);
    await supabase.from("whatsapp_conversations").update({
      last_message: lastMessage || content || `[${messageType}]`,
      last_message_at: sentAt,
      unread_count: fromMe ? conv.unread_count : (conv.unread_count || 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq("id", conv.id);
  }
}

async function handleMessageUpsert(session: any, event: any) {
  const messages = getMessageList(event);
  for (const message of messages) {
    await handleSingleMessageUpsert(session, message);
  }
}

async function handleMessageUpdate(session: any, event: any) {
  const updates = getMessageList(event);
  for (const item of updates) {
    const messageIds = collectMessageIds(item, event);
    if (!messageIds.length) continue;

    const status = receiptStatus(item, event);
    const update: any = {};
    if (status === "delivered") {
      update.status = "delivered";
      update.delivered_at = new Date().toISOString();
    } else if (status === "read") {
      update.status = "read";
      update.read_at = new Date().toISOString();
      update.delivered_at = new Date().toISOString();
    }

    if (Object.keys(update).length > 0) {
      await supabase
        .from("whatsapp_messages")
        .update(update)
        .eq("session_id", session.id)
        .in("message_id", messageIds);
    }
  }
}

async function handleConnectionUpdate(session: any, event: any) {
  const target = event.data || event;
  const state = (target.state || target.status || "").toLowerCase();
  if (!state && target.loggedIn === undefined) return;
  
  const loggedIn = target.loggedIn === true || target.LoggedIn === true;
  const connected = target.connected === true || target.Connected === true;

  let status = "disconnected";
  let reason = "unknown";

  if (loggedIn || state === "open" || state === "connected") {
    // Safety check: LoggedIn: false is definitive for Evolution Go
    if (target.LoggedIn === false || target.loggedIn === false) {
      status = "qr_ready";
      reason = "Connected but LoggedIn is explicitly false";
    } else {
      status = "connected";
      reason = "LoggedIn is true or state is open";
    }
  } else if (connected || state === "qr") {
    status = "qr_ready";
    reason = "Instance connected but not LoggedIn";
  } else if (state === "close" || state === "closed" || state === "disconnected") {
    status = "disconnected";
    reason = "State is closed/disconnected";
  }

  const update: any = { status, updated_at: new Date().toISOString() };
  if (status === "connected") {
    update.last_connected_at = new Date().toISOString();
    // Try to get phone from event if available
    const phone = target.jid?.split("@")[0] || event.jid?.split("@")[0];
    if (phone) update.phone_number = phone;
  }

  console.log(`[EvolutionWebhook] Update: status=${status}, reason=${reason}`, {
    session_id: session.id,
    instance_name: session.instance_name,
    connected_flag: connected,
    loggedIn_flag: loggedIn,
    raw_state: state,
    filter: { id: session.id }
  });

  await supabase.from("whatsapp_sessions").update(update).eq("id", session.id);
}

async function handleQrUpdate(session: any, event: any) {
  const qr = event.data?.qrcode || event.qrcode || event.qr;
  
  console.log(`[EvolutionWebhook] QR Update:`, {
    session_id: session.id,
    instance_name: session.instance_name,
    new_status: "qr_ready",
    filter: { id: session.id }
  });

  await supabase.from("whatsapp_sessions").update({
    status: "qr_ready",
    advanced_settings: { ...(session.advanced_settings || {}), qr_code: qr, qr_updated_at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  }).eq("id", session.id);
}

async function handleLabelsUpsert(session: any, event: any) {
  const labels = Array.isArray(event.data) ? event.data : [event.data || event];
  for (const l of labels) {
    if (!l?.id) continue;
    await supabase.from("whatsapp_labels").upsert({
      session_id: session.id,
      organization_id: session.organization_id,
      remote_label_id: String(l.id),
      name: l.name || `Label ${l.id}`,
      color: l.color ?? null,
      predefined: !!l.predefined,
    }, { onConflict: "session_id,remote_label_id" });
  }
}

async function handleGroupsUpsert(session: any, event: any) {
  const groups = Array.isArray(event.data || event.Data) ? (event.data || event.Data) : [event.data || event.Data || event];
  for (const g of groups) {
    const jid = g.id || g.ID || g.jid || g.JID || g.groupJid || g.GroupJid || g.GroupJID;
    if (!jid) continue;
    const groupJid = normalizeRemoteJid(jid);
    const subject = g.subject || g.Subject || g.name || g.Name || null;
    const pictureUrl = g.pictureUrl || g.PictureUrl || g.profilePictureUrl || null;
    await supabase.from("whatsapp_groups").upsert({
      session_id: session.id,
      organization_id: session.organization_id,
      group_jid: groupJid,
      subject,
      description: g.desc || g.description || g.Description || null,
      picture_url: pictureUrl,
      participants: g.participants || g.Participants || [],
      owner_jid: g.owner || g.Owner || null,
      is_announce: !!(g.announce || g.Announce),
      updated_at: new Date().toISOString(),
    }, { onConflict: "session_id,group_jid" });

    const convUpdate: any = {};
    if (subject) convUpdate.contact_name = subject;
    if (pictureUrl) convUpdate.contact_picture = pictureUrl;
    if (Object.keys(convUpdate).length) {
      await supabase
        .from("whatsapp_conversations")
        .update(convUpdate)
        .eq("session_id", session.id)
        .eq("remote_jid", groupJid);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Security: validate Evolution Go apikey header
    const incomingKey = req.headers.get("apikey") || req.headers.get("x-api-key");
    if (API_KEY && incomingKey && incomingKey !== API_KEY) {
      return new Response("forbidden", { status: 403, headers: corsHeaders });
    }

    const url = new URL(req.url);
    const sid = url.searchParams.get("session_id") || url.searchParams.get("sessionId");
    const instanceId = url.searchParams.get("instance_id")
      || url.searchParams.get("instanceId")
      || req.headers.get("instanceid")
      || req.headers.get("instance-id");

    const body = await req.json().catch(() => ({}));
    const event =
      body?.event ||
      body?.Event ||
      body?.type ||
      body?.Type ||
      body?.action ||
      body?.Action ||
      (body?.Info || body?.info || body?.Message || body?.message || body?.data?.Info || body?.data?.Message ? "message" : "");
    const bodyInstanceId =
      body?.instanceId ||
      body?.InstanceID ||
      body?.InstanceId ||
      body?.instance_id ||
      body?.data?.instanceId ||
      body?.data?.InstanceID ||
      body?.data?.InstanceId ||
      body?.data?.instance_id;

    // Find the session - Prioritize session_id from query for uniqueness
    let session: any = null;
    const bodySid = body?.session_id || body?.sessionId;
    const finalSid = sid || bodySid;

    if (finalSid) {
      const { data } = await supabase.from("whatsapp_sessions").select("*").eq("id", finalSid).maybeSingle();
      session = data;
    }

    // Fallbacks only if session_id didn't work
    if (!session && (instanceId || bodyInstanceId)) {
      const lookupInstance = instanceId || bodyInstanceId;
      const { data } = await supabase.from("whatsapp_sessions").select("*")
        .or(`instance_id.eq.${lookupInstance},instance_name.eq.${lookupInstance}`)
        .eq("provider", "evolution_go")
        .maybeSingle();
      session = data;
    }
    if (!session && body?.instance) {
      const { data } = await supabase.from("whatsapp_sessions").select("*")
        .or(`instance_id.eq.${body.instance},instance_name.eq.${body.instance}`)
        .eq("provider", "evolution_go")
        .maybeSingle();
      session = data;
    }

    if (!session) {
      console.warn("evolution-go-webhook: BLOCKED_STATUS_UPDATE_NO_UNIQUE_SESSION", { event, instanceId, sid: finalSid });
      return new Response(JSON.stringify({ ok: true, ignored: true, reason: "BLOCKED_STATUS_UPDATE_NO_UNIQUE_SESSION" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Run handler (fire-and-forget via waitUntil if possible)
    const work = (async () => {
      try {
        const normalizedEvent = event.toLowerCase().replace(/_/g, ".");
        
        switch (normalizedEvent) {
          case "qrcode.updated":
          case "qr.updated":
          case "qr":
            await handleQrUpdate(session, body); break;
          case "connection.update":
          case "connection.status":
          case "connection":
            await handleConnectionUpdate(session, body); break;
          case "pair.success":
            // On pair success, we can treat it as connected
            await handleConnectionUpdate(session, { ...body, state: "open" }); break;
          case "messages.upsert":
          case "message.upsert":
          case "messages.received":
          case "message.received":
          case "messages":
          case "message":
            await handleMessageUpsert(session, body); break;
          case "messages.update":
          case "message.update":
          case "message.status":
          case "messages.status":
          case "receipt":
          case "receipts":
          case "receipt.update":
          case "receipts.update":
          case "read.receipt":
          case "read.receipts":
            await handleMessageUpdate(session, body); break;
          case "labels.upsert":
          case "labels.set":
            await handleLabelsUpsert(session, body); break;
          case "groups.upsert":
          case "groups.update":
            await handleGroupsUpsert(session, body); break;
          case "connected":
            await handleConnectionUpdate(session, { ...body, data: { ...(body.data || {}), status: "open" } }); break;
          case "loggedout":
          case "logged.out":
            await handleConnectionUpdate(session, { ...body, data: { ...(body.data || {}), status: "disconnected" } }); break;
          default:
            console.log("evolution-go-webhook: unhandled event", event);
        }
      } catch (e) {
        console.error("handler error:", e);
      }
    })();

    // @ts-expect-error EdgeRuntime is provided by Supabase
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
    else await work;

    return new Response(JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("evolution-go-webhook fatal:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
