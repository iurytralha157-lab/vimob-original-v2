// Sync WhatsApp contact avatars in bulk for all leads in an organization.
// Iterates leads with phone and fetches profile picture via evolution-go-proxy
// (or evolution-proxy for legacy provider). Updates leads.whatsapp_avatar_url.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_URL = (Deno.env.get("EVOLUTION_GO_API_URL") || "").replace(/\/+$/, "");
const API_KEY = Deno.env.get("EVOLUTION_GO_API_KEY") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const diagnostics: any[] = [];
let avatarTimeouts = 0;
const MAX_AVATAR_TIMEOUTS = 12;
const DEFAULT_FETCH_TIMEOUT_MS = 5000;
const AVATAR_FETCH_TIMEOUT_MS = 30000;

function normalizePhone(p: string) {
  return String(p || "").replace(/@.*/, "").replace(/:.*/, "").replace(/\D/g, "");
}
function phoneVariants(p: string): string[] {
  const digits = normalizePhone(p);
  if (!digits) return [];

  const variants = new Set<string>([digits]);
  if (digits.startsWith("55") && digits.length >= 12) variants.add(digits.slice(2));
  else if (digits.length >= 10) variants.add("55" + digits);

  const withoutCountry = digits.startsWith("55") ? digits.slice(2) : digits;
  const ddd = withoutCountry.slice(0, 2);
  const local = withoutCountry.slice(2);
  if (ddd.length === 2 && local.length === 8) {
    variants.add(`${ddd}9${local}`);
    variants.add(`55${ddd}9${local}`);
  } else if (ddd.length === 2 && local.length === 9 && local.startsWith("9")) {
    variants.add(`${ddd}${local.slice(1)}`);
    variants.add(`55${ddd}${local.slice(1)}`);
  }

  return [...variants];
}
function toJid(phone: string) {
  const d = normalizePhone(phone);
  if (!d) return null;
  const withCountry = d.startsWith("55") ? d : "55" + d;
  return `${withCountry}@s.whatsapp.net`;
}
function jidToNumber(jidOrPhone: string) {
  const value = String(jidOrPhone || "");
  if (value.endsWith("@g.us")) return value;
  return normalizePhone(value);
}

async function goFetchJson(instanceId: string, token: string, path: string, body?: any) {
  const url = new URL(`${API_URL}${path}`);
  if (path !== "/user/avatar") url.searchParams.set("instanceId", instanceId);
  const safeBody = body ? { ...body, number: body.number ? `${String(body.number).slice(0, 4)}***${String(body.number).slice(-2)}` : undefined } : undefined;
  const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort("timeout"),
      path === "/user/avatar" ? AVATAR_FETCH_TIMEOUT_MS : DEFAULT_FETCH_TIMEOUT_MS,
    );
  try {
    const res = await fetch(url.toString(), {
      method: body === undefined ? "GET" : "POST",
      headers: {
        apikey: token || API_KEY,
        "Content-Type": "application/json",
        ...(path === "/user/avatar" ? {} : { instanceId }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    const avatarValue = json?.avatar || json?.data?.avatar || json?.url || json?.data?.url || null;
    diagnostics.push({
      path,
      status: res.status,
      ok: res.ok,
      instanceId,
      body: safeBody,
      keys: json && typeof json === "object" ? Object.keys(json).slice(0, 12) : [],
      success: json?.success,
      avatar_length: typeof avatarValue === "string" ? avatarValue.length : 0,
      text_preview: typeof text === "string" ? text.slice(0, 180).replace(/[A-Za-z0-9+/=]{80,}/g, "[base64]") : "",
    });
    if (!res.ok) return null;
    return json;
  } catch (e) {
    clearTimeout(timeoutId);
    if (path === "/user/avatar") avatarTimeouts++;
    diagnostics.push({
      path,
      instanceId,
      body: safeBody,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

function extractAvatar(value: any): string | null {
  const avatar =
    value?.success === false ? null :
    value?.URL ||
    value?.url ||
    value?.avatar ||
    value?.picture ||
    value?.pictureUrl ||
    value?.profilePictureUrl ||
    value?.data?.URL ||
    value?.data?.url ||
    value?.data?.avatar ||
    value?.data?.picture ||
    value?.data?.pictureUrl ||
    value?.data?.profilePictureUrl ||
    null;
  if (!avatar || typeof avatar !== "string") return null;
  return /^https?:\/\//i.test(avatar) || avatar.startsWith("data:")
    ? avatar
    : `data:image/jpeg;base64,${avatar}`;
}

function getNested(obj: any, paths: string[]) {
  for (const path of paths) {
    const value = path.split(".").reduce((acc, key) => acc?.[key], obj);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function cleanContactName(value: any): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /^\+?\d+$/.test(trimmed)) return null;
  return trimmed;
}

async function goFetchContactMaps(instanceId: string, token: string): Promise<{
  avatars: Map<string, string>;
  names: Map<string, string>;
}> {
  const avatars = new Map<string, string>();
  const names = new Map<string, string>();
  const data = await goFetchJson(instanceId, token, "/user/contacts");
  const rows =
    Array.isArray(data) ? data :
    Array.isArray(data?.data) ? data.data :
    Array.isArray(data?.contacts) ? data.contacts :
    Array.isArray(data?.data?.contacts) ? data.data.contacts :
    [];

  diagnostics.push({
    path: "/user/contacts:parsed",
    count: rows.length,
    sample_keys: rows[0] && typeof rows[0] === "object" ? Object.keys(rows[0]).slice(0, 20) : [],
  });

  for (const row of rows) {
    const rawId = getNested(row, ["jid", "Jid", "JID", "id", "ID", "number", "Number", "phone", "Phone", "phoneNumber", "PhoneNumber"]);
    const avatar = extractAvatar(row) || extractAvatar(row?.profilePicture) || extractAvatar(row?.picture);
    const name = cleanContactName(getNested(row, [
      "FullName",
      "fullName",
      "PushName",
      "pushName",
      "BusinessName",
      "businessName",
      "DisplayName",
      "displayName",
      "Name",
      "name",
      "FirstName",
      "firstName",
      "Notify",
      "notify",
    ]));
    if (!rawId) continue;
    const key = String(rawId).endsWith("@g.us") ? String(rawId) : normalizePhone(String(rawId));
    if (!key) continue;
    if (avatar) avatars.set(key, avatar);
    if (name) names.set(key, name);
  }
  diagnostics.push({
    path: "/user/contacts:maps",
    avatars: avatars.size,
    names: names.size,
  });
  return { avatars, names };
}

async function storeAvatar(
  organizationId: string,
  sessionId: string,
  ownerId: string,
  rawAvatar: string,
): Promise<string> {
  let contentType = "image/jpeg";
  let bytes: Uint8Array | null = null;

  if (/^https?:\/\//i.test(rawAvatar)) {
    try {
      const response = await fetch(rawAvatar);
      if (!response.ok) return rawAvatar;
      contentType = response.headers.get("content-type") || contentType;
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      console.warn("avatar remote download failed", {
        ownerId,
        error: error instanceof Error ? error.message : String(error),
      });
      return rawAvatar;
    }
  } else if (rawAvatar.startsWith("data:")) {
    const match = rawAvatar.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) return rawAvatar;
    contentType = match[1] || contentType;
    const base64 = match[2] || "";
    bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  } else {
    return rawAvatar;
  }

  if (!bytes || bytes.length < 50) return rawAvatar;

  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";

  const path = `orgs/${organizationId}/sessions/${sessionId}/avatars/${ownerId}.${ext}`;
  const { error } = await supabase.storage
    .from("whatsapp-media")
    .upload(path, bytes, { contentType, upsert: true });
  if (error) {
    console.error("avatar upload error:", error, { ownerId, contentType });
    return rawAvatar;
  }
  const { data } = supabase.storage.from("whatsapp-media").getPublicUrl(path);
  return data.publicUrl;
}

async function updateLeadsAvatarByPhone(
  organizationId: string,
  phoneOrJid: string,
  avatarUrl: string,
): Promise<number> {
  const variants = phoneVariants(phoneOrJid);
  if (!variants.length || !avatarUrl) return 0;

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id")
    .eq("organization_id", organizationId)
    .or(variants.map((v) => `phone.ilike.%${v}%`).join(","))
    .limit(10);

  if (error || !leads?.length) return 0;

  let updated = 0;
  for (const lead of leads) {
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        whatsapp_avatar_url: avatarUrl,
        whatsapp_avatar_synced_at: new Date().toISOString(),
      })
      .eq("id", lead.id);
    if (!updateError) updated++;
  }
  return updated;
}

async function goFetchAvatar(instanceId: string, token: string, jid: string): Promise<string | null> {
  if (avatarTimeouts >= MAX_AVATAR_TIMEOUTS) return null;
  const number = jidToNumber(jid);
  const localNumber = number.startsWith("55") && number.length > 11 ? number.slice(2) : number;
  const bodies = [
    { number, preview: true },
    { number, preview: false },
    ...(localNumber !== number ? [{ number: localNumber, preview: true }] : []),
    ...(localNumber !== number ? [{ number: localNumber, preview: false }] : []),
  ];
  for (const body of bodies) {
    if (avatarTimeouts >= MAX_AVATAR_TIMEOUTS) break;
    try {
      const j = await goFetchJson(instanceId, token, "/user/avatar", body);
      const avatar = extractAvatar(j);
      if (avatar) return avatar;
      if (diagnostics.at(-1)?.status === 401) break;
    } catch {
      // Try the next accepted Evolution Go body shape.
    }
  }
  return null;
}

async function goFetchGroupAvatar(instanceId: string, token: string, groupJid: string): Promise<string | null> {
  const bodies = [
    { groupJid },
    { jid: groupJid },
    { id: groupJid },
  ];
  for (const body of bodies) {
    try {
      const before = diagnostics.length;
      const j = await goFetchJson(instanceId, token, "/group/info", body);
      const target = j?.data || j?.group || j;
      const avatar =
        target?.pictureUrl ||
        target?.PictureUrl ||
        target?.picture_url ||
        target?.profilePictureUrl ||
        target?.ProfilePictureUrl ||
        target?.avatar ||
        target?.Avatar ||
        null;
      const normalized = extractAvatar({ avatar });
      if (normalized) return normalized;
      const last = diagnostics[diagnostics.length - 1] || diagnostics[before];
      if (last?.status === 401 || (last?.status === 200 && body.groupJid)) break;
    } catch {
      // Try next shape.
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: claims } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    const userId = claims?.claims?.sub;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { session_id, limit = 100, max_avatar_fetches = 8 } = await req.json().catch(() => ({}));
    if (!session_id) throw new Error("session_id required");

    const { data: session } = await supabase
      .from("whatsapp_sessions")
      .select("id, organization_id, instance_id, instance_name, provider, phone_number, advanced_settings")
      .eq("id", session_id)
      .maybeSingle();
    if (!session) throw new Error("session not found");
    if (session.provider !== "evolution_go") {
      throw new Error("only evolution_go provider supported here");
    }

    const instanceKeys = Array.from(new Set([session.instance_name, session.instance_id].filter(Boolean)));
    const inst = instanceKeys[0];
    if (!inst) throw new Error("instance id missing");
    const sessionToken = session.advanced_settings?.token && session.advanced_settings.token !== "default_token"
      ? session.advanced_settings.token
      : API_KEY;
    diagnostics.length = 0;
    avatarTimeouts = 0;
    const contactMaps = await goFetchContactMaps(inst, sessionToken);

    let sessionAvatarUpdated = false;
    if (session.phone_number) {
      let avatar: string | null = null;
      for (const instanceKey of instanceKeys) {
        avatar = await goFetchAvatar(instanceKey, sessionToken, session.phone_number);
        if (avatar) break;
      }
      if (avatar) {
        const stored = await storeAvatar(session.organization_id, session.id, `session-${session.id}`, avatar);
        const { error } = await supabase
          .from("whatsapp_sessions")
          .update({ profile_picture: stored, updated_at: new Date().toISOString() })
          .eq("id", session.id);
        sessionAvatarUpdated = !error;
      }
    }

    // First refresh the conversation rows used by the WhatsApp inbox.
    const { data: conversations } = await supabase
      .from("whatsapp_conversations")
      .select("id, remote_jid, contact_phone, contact_picture, is_group")
      .eq("session_id", session.id)
      .is("deleted_at", null)
      .or("contact_picture.is.null,contact_picture.eq.")
      .order("updated_at", { ascending: false })
      .limit(Math.min(limit, 500));

    let processedConversations = 0;
    let updatedConversations = 0;
    let leadsUpdatedFromConversations = 0;
    let avatarFetches = 0;
    for (const conversation of conversations || []) {
      const jid = conversation.remote_jid || toJid(conversation.contact_phone || "");
      if (!jid) continue;
      processedConversations++;
      const contactMapKey = conversation.is_group ? jid : jidToNumber(jid);
      const contactName = !conversation.is_group ? contactMaps.names.get(contactMapKey) : null;
      let url = contactMaps.avatars.get(contactMapKey) || null;
      if (!url) {
        for (const instanceKey of instanceKeys) {
          if (avatarFetches >= max_avatar_fetches) break;
          avatarFetches++;
          url = conversation.is_group
            ? await goFetchGroupAvatar(instanceKey, sessionToken, jid)
            : await goFetchAvatar(instanceKey, sessionToken, jid);
          if (url) break;
        }
      }
      const update: any = { updated_at: new Date().toISOString() };
      if (contactName) update.contact_name = contactName;
      if (url) {
        update.contact_picture = await storeAvatar(session.organization_id, session.id, conversation.id, url);
      }
      if (!contactName && !url) continue;
      const { error: convErr } = await supabase
        .from("whatsapp_conversations")
        .update(update)
        .eq("id", conversation.id);
      if (!convErr) updatedConversations++;
      if (!conversation.is_group && update.contact_picture) {
        leadsUpdatedFromConversations += await updateLeadsAvatarByPhone(session.organization_id, jid, update.contact_picture);
      }
    }

    // Pick leads needing avatar refresh (>30d or null)
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: leads } = await supabase
      .from("leads")
      .select("id, phone, whatsapp_avatar_synced_at")
      .eq("organization_id", session.organization_id)
      .not("phone", "is", null)
      .or(`whatsapp_avatar_synced_at.is.null,whatsapp_avatar_synced_at.lt.${cutoff}`)
      .limit(Math.min(limit, 500));

    let updated = 0;
    for (const lead of leads || []) {
      const jid = toJid(lead.phone);
      if (!jid) continue;
      const phoneKey = jidToNumber(jid);
      let url = contactMaps.avatars.get(phoneKey) || null;
      if (!url) {
        for (const instanceKey of instanceKeys) {
          if (avatarFetches >= max_avatar_fetches) break;
          avatarFetches++;
          url = await goFetchAvatar(instanceKey, sessionToken, jid);
          if (url) break;
        }
      }
      const storedUrl = url ? await storeAvatar(session.organization_id, session.id, `lead-${lead.id}`, url) : null;
      if (storedUrl) {
        await supabase.from("leads").update({
          whatsapp_avatar_url: storedUrl,
          whatsapp_avatar_synced_at: new Date().toISOString(),
        }).eq("id", lead.id);
      }

      if (storedUrl) {
        const phone = normalizePhone(jid);
        const update: any = { contact_picture: storedUrl, updated_at: new Date().toISOString() };
        const contactName = contactMaps.names.get(phoneKey);
        if (contactName) update.contact_name = contactName;
        await supabase
          .from("whatsapp_conversations")
          .update(update)
          .eq("session_id", session.id)
          .eq("is_group", false)
          .or(`remote_jid.eq.${phone}@s.whatsapp.net,remote_jid.eq.${phone}@c.us,contact_phone.eq.${phone}`);
      }
      if (storedUrl) updated++;
    }

    const { data: conversationsWithPicture } = await supabase
      .from("whatsapp_conversations")
      .select("remote_jid, contact_phone, contact_picture")
      .eq("session_id", session.id)
      .eq("is_group", false)
      .is("deleted_at", null)
      .not("contact_picture", "is", null)
      .limit(Math.min(limit, 500));

    for (const conversation of conversationsWithPicture || []) {
      const avatar = conversation.contact_picture;
      const phoneOrJid = conversation.remote_jid || conversation.contact_phone || "";
      if (!avatar || !phoneOrJid) continue;
      leadsUpdatedFromConversations += await updateLeadsAvatarByPhone(session.organization_id, phoneOrJid, avatar);
    }

    return new Response(
      await (async () => {
        await supabase
          .from("whatsapp_sessions")
          .update({
            advanced_settings: {
              ...(session.advanced_settings || {}),
              avatar_sync_diagnostics: {
                at: new Date().toISOString(),
                instance_used: inst,
                instance_keys: instanceKeys,
                api_url_set: !!API_URL,
                api_key_set: !!API_KEY,
                avatar_timeout_circuit_open: avatarTimeouts >= MAX_AVATAR_TIMEOUTS,
                session_avatar_updated: sessionAvatarUpdated,
                conversations_processed: processedConversations,
                conversations_updated: updatedConversations,
                leads_updated_from_conversations: leadsUpdatedFromConversations,
                avatar_fetches: avatarFetches,
                max_avatar_fetches,
                leads_processed: leads?.length || 0,
                leads_updated: updated,
                samples: diagnostics.slice(0, 25),
              },
            },
          })
          .eq("id", session.id);
        return JSON.stringify({
          ok: true,
          processed: leads?.length || 0,
          updated,
          session_avatar_updated: sessionAvatarUpdated,
          conversations_processed: processedConversations,
          conversations_updated: updatedConversations,
          leads_updated_from_conversations: leadsUpdatedFromConversations,
          avatar_fetches: avatarFetches,
        });
      })(),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("sync-whatsapp-contacts error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
