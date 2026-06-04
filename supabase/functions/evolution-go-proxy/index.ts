// Evolution Go (whatsmeow) proxy
// Routes actions from frontend to the Evolution Go REST API
import { createClient } from "npm:@supabase/supabase-js@2";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 1. Internal Helpers
function getEvolutionConfig() {
  const url = (Deno.env.get("EVOLUTION_GO_API_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("EVOLUTION_GO_API_KEY") || "";
  return { API_URL: url, API_KEY: key };
}

function maskApiKey(key: string | undefined): string {
  if (!key) return "not_set";
  if (key.length <= 6) return "***";
  return `${key.substring(0, 6)}***`;
}

function getEvolutionInstanceKey(session: any): string {
  // Rule: Prefer instance_name, fallback to instance_id, never use session.id
  return session?.instance_name || session?.instance_id || "";
}

async function normalizeEvolutionResponse(res: Response, rawText: string) {
  let data: any;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch (_err) {
    data = { raw: rawText };
  }
  
  return {
    status: res.status,
    ok: res.ok,
    data,
    rawText
  };
}

function normalizeQRCodeResponse(data: any) {
  if (!data) return { found: false };

  const possibleFields = [
    { field: "qrcode", value: data?.qrcode },
    { field: "Qrcode", value: data?.Qrcode },
    { field: "qrCode", value: data?.qrCode },
    { field: "base64", value: data?.base64 },
    { field: "code", value: data?.code },
    { field: "data.qrcode", value: data?.data?.qrcode },
    { field: "data.Qrcode", value: data?.data?.Qrcode },
    { field: "data.base64", value: data?.data?.base64 },
    { field: "data.code", value: data?.data?.code },
  ];

  const found = possibleFields.find(f => f.value && typeof f.value === "string");
  
  if (found) {
    return {
      found: true,
      field: found.field,
      value: found.value
    };
  }
  
  return { found: false };
}

function getNested(obj: any, path: string) {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

function extractSentMessageId(data: any): string | null {
  if (!data) return null;
  const paths = [
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
    "Data.key.id",
    "Data.Key.ID",
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

function withNormalizedSentId(action: string, data: any) {
  if (!["send.text", "send.media", "send.audio", "send.sticker"].includes(action)) return data;
  const messageId = extractSentMessageId(data);
  if (!messageId) return data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return { ...data, messageId, sentMessageId: messageId };
  }
  return { data, messageId, sentMessageId: messageId };
}

function isSendAction(action: string) {
  return ["send.text", "send.media", "send.audio", "send.sticker", "send.location", "send.contact", "send.link", "send.poll"].includes(action);
}

function firstPresent(...values: any[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function withoutEmpty(obj: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function normalizeMentionedJid(value: any) {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return undefined;
}

function sendCommonBody(b: any) {
  return withoutEmpty({
    number: firstPresent(b.number, b.phone, b.jid, b.remoteJid),
    delay: b.delay,
    quoted: b.quoted,
    mentionAll: b.mentionAll,
    mentionedJid: normalizeMentionedJid(firstPresent(b.mentionedJid, b.mentionedJids, b.mentions)),
  });
}

function sendTextBody(b: any) {
  return withoutEmpty({
    ...sendCommonBody(b),
    text: firstPresent(b.text, b.message, b.body, b.caption),
  });
}

function sendMediaBody(b: any, forcedType?: string) {
  const type = firstPresent(forcedType, b.type, b.mediatype, b.mediaType, b.kind);
  const url = firstPresent(b.url, b.mediaUrl, b.media, b.base64, b.path, b.file);
  const filename = firstPresent(b.filename, b.fileName, b.name);
  return withoutEmpty({
    ...sendCommonBody(b),
    type,
    url,
    caption: b.caption,
    filename,
    mimetype: b.mimetype,
    ptt: firstPresent(b.ptt, type === "audio" ? true : undefined),
    media: url,
    base64: b.base64,
    path: url,
    file: url,
    audio: type === "audio" ? url : undefined,
    image: type === "image" ? url : undefined,
    video: type === "video" ? url : undefined,
    document: type === "document" ? url : undefined,
    mediatype: type,
    mediaType: type,
    fileName: filename,
  });
}

function sendStickerBody(b: any) {
  const sticker = firstPresent(b.sticker, b.url, b.media, b.mediaUrl, b.base64, b.path);
  return withoutEmpty({
    ...sendCommonBody(b),
    sticker,
    url: sticker,
  });
}

function normalizeStatus(data: any) {
  if (!data) return "disconnected";

  // Data can be nested or flat depending on the endpoint
  const target = data?.data || data;

  const rawState = (target.state || target.connectionStatus || "").toLowerCase();
  const rawStatus = (target.status || "").toLowerCase();
  
  // Rule: LoggedIn is the definitive truth for Evolution Go
  const loggedIn = target.loggedIn === true || target.LoggedIn === true;
  const connected = target.connected === true || target.Connected === true;

  // 1. Connected: Only if loggedIn is true
  if (loggedIn || rawState === "open" || rawStatus === "open") {
    // Safety check: if we have an explicit LoggedIn: false, it's not connected
    if (target.LoggedIn === false || target.loggedIn === false) {
      console.log(`[EvolutionProxy] Normalization: Connected=true but LoggedIn=false. Mapping to qr_ready.`);
      return "qr_ready";
    }
    return "connected";
  }

  // 2. QR Ready: If connected (instance active) but not loggedIn (no session)
  // Or if we explicitly find a QR code
  const qr = normalizeQRCodeResponse(data);
  if (connected || qr.found || rawStatus === "qr") {
    console.log(`[EvolutionProxy] Normalization: Instance active (Connected: ${connected}) but not LoggedIn. Mapping to qr_ready.`);
    return "qr_ready";
  }

  // 3. Disconnected: Everything else
  const isDisconnected = 
    loggedIn === false ||
    ["close", "closed", "disconnected", "disconnect", "offline", "logout", "logged_out"].includes(rawState) ||
    ["close", "closed", "disconnected", "offline", "logout", "logged_out"].includes(rawStatus) ||
    rawState === "null" ||
    !rawState;

  if (isDisconnected) return "disconnected";

  return "disconnected";
}

async function evolutionFetch(
  method: string, 
  path: string, 
  options: { 
    body?: any, 
    query?: Record<string, string | number | undefined>, 
    instanceId?: string,
    token?: string,
    action?: string
  } = {}
) {
  const { API_URL, API_KEY } = getEvolutionConfig();
  if (!API_URL || !API_KEY) {
    throw new Error("Evolution Go API configuration missing");
  }

  const url = new URL(`${API_URL}${path}`);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    "apikey": options.token && options.token !== "default_token" ? options.token : API_KEY,
    "Content-Type": "application/json",
  };
  
  if (options.instanceId) {
    headers["instanceId"] = options.instanceId;
  }

  const init: RequestInit = { 
    method, 
    headers 
  };
  
  if (options.body !== undefined && method !== "GET" && method !== "HEAD") {
    init.body = JSON.stringify(options.body);
  }

  try {
    const res = await fetch(url.toString(), init);
    const rawText = await res.text();
    return await normalizeEvolutionResponse(res, rawText);
  } catch (err: any) {
    console.error(`[EvolutionProxy] Fetch Error:`, err);
    throw err;
  }
}

const NOTIFICATION_SAFE_SETTINGS = {
  rejectCall: false,
  msgCall: "",
  groupsIgnore: false,
  alwaysOnline: false,
  readMessages: false,
  readStatus: false,
  syncFullHistory: false,
  wavoipToken: "",
};

function shouldRefreshNotificationSafeSettings(session: any): boolean {
  const settings = (session?.advanced_settings || {}) as Record<string, any>;
  const appliedAt = settings.notification_safe_settings_applied_at;
  if (!appliedAt) return true;

  const appliedTime = new Date(appliedAt).getTime();
  if (!Number.isFinite(appliedTime)) return true;

  return Date.now() - appliedTime > 12 * 60 * 60 * 1000;
}

async function applyNotificationSafeSettings(
  instanceKey: string,
  token?: string,
) {
  if (!instanceKey) return { skipped: true, reason: "missing_instance" };

  const attempts = [];

  let result = await evolutionFetch(
    "POST",
    `/settings/set/${encodeURIComponent(instanceKey)}`,
    { body: NOTIFICATION_SAFE_SETTINGS },
  );
  attempts.push({ endpoint: `/settings/set/${instanceKey}`, status: result.status, ok: result.ok });

  if (!result.ok) {
    result = await evolutionFetch(
      "POST",
      "/settings/set",
      { body: NOTIFICATION_SAFE_SETTINGS, query: { instanceId: instanceKey }, instanceId: instanceKey },
    );
    attempts.push({ endpoint: "/settings/set?instanceId=...", status: result.status, ok: result.ok });
  }

  if (!result.ok && token) {
    result = await evolutionFetch(
      "POST",
      `/settings/set/${encodeURIComponent(instanceKey)}`,
      { body: NOTIFICATION_SAFE_SETTINGS, token },
    );
    attempts.push({ endpoint: `/settings/set/${instanceKey} with token`, status: result.status, ok: result.ok });
  }

  console.log("[EvolutionProxy] notification_safe_settings", {
    instanceKey,
    status: result.status,
    ok: result.ok,
    attempts,
  });

  return {
    ok: result.ok,
    status: result.status,
    data: result.data,
    attempts,
  };
}

// Helper for dual-endpoint fetching (primary vs fallback)
async function smartFetch(
  method: string,
  primaryPath: string,
  fallbackPath: string,
  instanceKey: string,
  token?: string
) {
  console.log(`[EvolutionProxy] SmartFetch trying primary: ${primaryPath}`);
  let result = await evolutionFetch(method, primaryPath, { token });
  let endpointUsed = primaryPath;

  if (result.status === 404) {
    console.log(`[EvolutionProxy] Primary 404, trying fallback: ${fallbackPath} with instanceId header`);
    result = await evolutionFetch(method, fallbackPath, { 
      token, 
      instanceId: instanceKey,
      query: method === "GET" ? { instanceId: instanceKey } : undefined
    });
    endpointUsed = fallbackPath;
  }

  return { ...result, endpointUsed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { API_KEY } = getEvolutionConfig();
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: claims, error: authError } =
      await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    
    if (authError || !claims?.claims) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payload = await req.json();
    const action: string = payload?.action;
    if (!action) throw new Error("Missing 'action'");

    const userId = String(claims.claims.sub || "unknown");
    const role = String(claims.claims.role || "");
    if (isSendAction(action) && role !== "service_role") {
      const rateLimit = await enforceRateLimit(
        supabase,
        req,
        "evolution-go-proxy:whatsapp-send",
        [
          { name: "per_second", limit: 2, windowSeconds: 1 },
          { name: "per_minute", limit: 20, windowSeconds: 60 },
        ],
        corsHeaders,
        { identifier: userId },
      );

      if (rateLimit.response) return rateLimit.response;
    }

    // Resolve session
    let session = null;
    if (payload.session_id) {
      const { data } = await supabase
        .from("whatsapp_sessions")
        .select("*")
        .eq("id", payload.session_id)
        .maybeSingle();
      session = data;
    }

    const instanceKey = getEvolutionInstanceKey(session || payload);
    const token = payload.token || (session?.advanced_settings as any)?.token;

    // --- Action: instance.status ---
    if (action === "instance.status") {
      const primaryPath = `/instance/${instanceKey}/status`;
      const fallbackPath = `/instance/status`;

      const result = await smartFetch("GET", primaryPath, fallbackPath, instanceKey, token);
      const isValid = result.status === 200 || result.status === 201;
      const normalizedStatus = isValid ? normalizeStatus(result.data) : null;
      
      let dbUpdated = false;
      let notificationSafeSettings: any = null;
      if (isValid && normalizedStatus && session?.id) {
        // Only update if normalized status is connected or disconnected
        if (["connected", "disconnected"].includes(normalizedStatus)) {
          console.log(`[EvolutionProxy] manual_verify Update:`, {
            session_id: session.id,
            instance_id: session.instance_id,
            instance_name: session.instance_name,
            old_status: session.status,
            new_status: normalizedStatus,
            filter: { id: session.id }
          });

          const { error: updateError } = await supabase
            .from("whatsapp_sessions")
            .update({ status: normalizedStatus, updated_at: new Date().toISOString() })
            .eq("id", session.id);
          
          if (!updateError) dbUpdated = true;
        }

        if (normalizedStatus === "connected" && shouldRefreshNotificationSafeSettings(session)) {
          try {
            notificationSafeSettings = await applyNotificationSafeSettings(instanceKey, token);
            const advancedSettings = {
              ...((session.advanced_settings || {}) as Record<string, any>),
              ...(notificationSafeSettings?.ok
                ? {
                    notification_safe_settings_applied_at: new Date().toISOString(),
                    notification_safe_settings_last_error: null,
                    notification_safe_settings_last_attempts: notificationSafeSettings?.attempts || null,
                  }
                : {
                    notification_safe_settings_last_error: JSON.stringify({
                      status: notificationSafeSettings?.status,
                      data: notificationSafeSettings?.data,
                    }).slice(0, 1000),
                    notification_safe_settings_last_attempts: notificationSafeSettings?.attempts || null,
                    notification_safe_settings_last_failed_at: new Date().toISOString(),
                  }),
            };

            await supabase
              .from("whatsapp_sessions")
              .update({ advanced_settings: advancedSettings, updated_at: new Date().toISOString() })
              .eq("id", session.id);
          } catch (settingsError: any) {
            notificationSafeSettings = { ok: false, error: settingsError?.message || String(settingsError) };
            console.warn("[EvolutionProxy] Could not apply notification-safe settings:", notificationSafeSettings);
          }
        }
      }

      console.log(`[EvolutionProxy] Action: status`, {
        instanceKey,
        endpoint: result.endpointUsed,
        httpStatus: result.status,
        normalizedStatus,
        dbUpdated,
        notificationSafeSettings,
        rawText: result.rawText.substring(0, 500)
      });

      return new Response(
        JSON.stringify({ 
          ok: isValid, 
          status: result.status,
          data: result.data, 
          normalizedStatus,
          rawResponse: result.rawText,
          diagnostics: {
            endpointUsed: result.endpointUsed,
            instanceKey,
            dbUpdated,
            notificationSafeSettings
          }
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Action: instance.qr ---
    if (action === "instance.qr") {
      const primaryPath = `/instance/${instanceKey}/qrcode`;
      const fallbackPath = `/instance/qr`;

      const result = await smartFetch("GET", primaryPath, fallbackPath, instanceKey, token);
      const isValid = result.status === 200 || result.status === 201;
      const qrData = normalizeQRCodeResponse(result.data);

      console.log(`[EvolutionProxy] Action: qr`, {
        instanceKey,
        endpoint: result.endpointUsed,
        httpStatus: result.status,
        qrFound: qrData.found,
        rawText: result.rawText.substring(0, 500)
      });

      if (!isValid || !qrData.found) {
        return new Response(
          JSON.stringify({ 
            ok: false, 
            success: false,
            message: "QR Code ainda não disponível. Tente atualizar.",
            diagnostics: { endpointUsed: result.endpointUsed, instanceKey, httpStatus: result.status }
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          ok: true, 
          success: true,
          data: {
            qrcode: qrData.value,
            sourceEndpoint: result.endpointUsed,
            instanceKey
          }
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Fallback to other actions (create, delete, etc) ---
    // Note: User said don't touch these unless for standardization.
    // I'll keep them but use the token/instanceKey logic where applicable.
    
    // For now, I'll just handle the requested refactor and leave the rest as is but integrated.
    // However, the original code had a switch-case. Let's integrate it.

    const b = payload?.body ?? {};
    let method = "GET";
    let path = "";
    let body: any = undefined;
    let query: any = undefined;

    switch (action) {
      case "instance.create":
        method = "POST";
        path = "/instance/create";
        body = {
          name: b.name ?? b.instanceName,
          token: b.token || "default_token",
          advancedSettings: {
            ...(b.advancedSettings || {}),
            rejectCalls: false,
            groupsIgnore: false,
            alwaysOnline: false,
            readMessages: false,
            readStatus: false,
            syncFullHistory: false,
          },
          ...(b.proxy ? { proxy: b.proxy } : {})
        };
        break;
      
      case "instance.delete":
        method = "DELETE";
        path = `/instance/delete/${instanceKey}`;
        break;

      case "instance.connect":
        method = "POST";
        path = "/instance/connect";
        query = { instanceId: instanceKey };
        body = {
          webhookUrl: b.webhookUrl,
          subscribe: b.subscribe ?? ["ALL"],
          immediate: b.immediate ?? true,
        };
        break;

      case "instance.all":
        method = "GET";
        path = "/instance/all";
        break;

      case "instance.disconnect":
        method = "POST";
        path = "/instance/disconnect";
        query = { instanceId: instanceKey };
        break;

      case "instance.logout":
        method = "DELETE";
        path = "/instance/logout";
        query = { instanceId: instanceKey };
        break;

      case "send.text":     method = "POST"; path = "/send/text";     body = sendTextBody(b); break;
      case "send.media":    method = "POST"; path = "/send/media";    body = sendMediaBody(b); break;
      case "send.audio":    method = "POST"; path = "/send/media";    body = sendMediaBody(b, "audio"); break;
      case "send.sticker":  method = "POST"; path = "/send/sticker";  body = sendStickerBody(b); break;
      case "send.location": method = "POST"; path = "/send/location"; body = b; break;
      case "send.contact":  method = "POST"; path = "/send/contact";  body = b; break;
      case "send.link":     method = "POST"; path = "/send/link";     body = b; break;
      case "send.poll":     method = "POST"; path = "/send/poll";     body = b; break;

      // ---------- Message ----------
      case "message.delete":   method = "POST"; path = "/message/delete";        body = b; break;
      case "message.edit":     method = "POST"; path = "/message/edit";          body = b; break;
      case "message.react":    method = "POST"; path = "/message/react";         body = b; break;
      case "message.markread":
        if (b?.allowWhatsAppReadReceipt !== true) {
          console.log("[EvolutionProxy] message.markread skipped to preserve phone notifications", { instanceKey });
          return new Response(JSON.stringify({ ok: true, skipped: true, reason: "read_receipts_disabled" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        method = "POST"; path = "/message/markread"; body = b; break;
      case "message.presence": method = "POST"; path = "/message/presence";      body = b; break;
      case "message.status":   method = "POST"; path = "/message/status";        body = b; break;
      case "message.downloadMedia": method = "POST"; path = "/message/downloadimage"; body = b; break;

      // ---------- Chat ----------
      case "chat.archive":   method = "POST"; path = "/chat/archive";   body = b; break;
      case "chat.unarchive": method = "POST"; path = "/chat/archive";   body = { ...b, archive: false }; break;
      case "chat.mute":      method = "POST"; path = "/chat/mute";      body = b; break;
      case "chat.unmute":    method = "POST"; path = "/chat/mute";      body = { ...b, mute: false }; break;
      case "chat.pin":       method = "POST"; path = "/chat/pin";       body = b; break;
      case "chat.unpin":     method = "POST"; path = "/chat/unpin";     body = b; break;

      // ---------- Label ----------
      case "label.list":       method = "GET";  path = "/label"; break;
      case "label.edit":       method = "POST"; path = "/label/edit";     body = b; break;
      case "label.addChat":    method = "POST"; path = "/label/chat";     body = b; break;
      case "label.addMsg":     method = "POST"; path = "/label/message";  body = b; break;
      case "label.removeChat": method = "POST"; path = "/unlabel/chat";    body = b; break;
      case "label.removeMsg":  method = "POST"; path = "/unlabel/message"; body = b; break;

      // ---------- Group ----------
      case "group.list":        method = "GET";  path = "/group/list";  break;
      case "group.myAll":       method = "GET";  path = "/group/myall"; break;
      case "group.info":        method = "POST"; path = "/group/info";         body = b; break;
      case "group.create":      method = "POST"; path = "/group/create";       body = b; break;
      case "group.setName":     method = "POST"; path = "/group/name";         body = b; break;
      case "group.setPhoto":    method = "POST"; path = "/group/photo";        body = b; break;
      case "group.inviteLink":  method = "POST"; path = "/group/invitelink";   body = b; break;
      case "group.join":        method = "POST"; path = "/group/join";         body = b; break;
      case "group.leave":       method = "POST"; path = "/group/leave";        body = b; break;
      case "group.participant": method = "POST"; path = "/group/participant";  body = b; break;

      // ---------- User ----------
      case "user.avatar":    method = "POST"; path = "/user/avatar";   body = b; break;
      case "user.info":      method = "POST"; path = "/user/info";     body = b; break;
      case "user.check":     method = "POST"; path = "/user/check";    body = b; break;
      case "user.contacts":  method = "GET";  path = "/user/contacts"; break;
      case "user.block":     method = "POST"; path = "/user/block";    body = b; break;
      case "user.unblock":   method = "POST"; path = "/user/unblock";  body = b; break;
      case "user.blocklist": method = "GET";  path = "/user/blocklist"; break;

      default: {
        // If not status or qr, and not one of the few above, use evolutionFetch with original logic
        // But the user only cares about Status and QR refactor.
        // Let's just return a generic response for other actions if not explicitly handled here.
        const res = await evolutionFetch(method || "GET", path, { body, query, token, instanceId: instanceKey });
        return new Response(JSON.stringify({ ok: res.ok, status: res.status, data: res.data }), 
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const finalRes = await evolutionFetch(method, path, { body, query, token, instanceId: instanceKey });
    let notificationSafeSettings: any = null;
    if (finalRes.ok && (action === "instance.create" || action === "instance.connect")) {
      const targetInstance = action === "instance.create"
        ? (b.name ?? b.instanceName ?? instanceKey)
        : instanceKey;

      if (action === "instance.create") {
        notificationSafeSettings = { ok: true, source: "instance.create.advancedSettings" };
      } else {
        try {
          notificationSafeSettings = await applyNotificationSafeSettings(targetInstance, token);
        } catch (settingsError: any) {
          notificationSafeSettings = { ok: false, error: settingsError?.message || String(settingsError) };
          console.warn("[EvolutionProxy] Could not apply notification-safe settings after action:", {
            action,
            targetInstance,
            notificationSafeSettings,
          });
        }
      }
    }

    const responseData = withNormalizedSentId(action, finalRes.data);
    const responsePayload: Record<string, any> = { ok: finalRes.ok, status: finalRes.status, data: responseData };
    if (action === "instance.create" || action === "instance.connect") {
      responsePayload.notificationSafeSettings = notificationSafeSettings;
    }

    return new Response(JSON.stringify(responsePayload), 
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error(`[EvolutionProxy] Global Error:`, err);
    return new Response(JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
