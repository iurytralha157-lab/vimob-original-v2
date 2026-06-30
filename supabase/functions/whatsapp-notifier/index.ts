import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendEvolutionGoText(
  instanceName: string,
  number: string,
  text: string,
  token?: string | null,
) {
  const apiUrl = (Deno.env.get("EVOLUTION_GO_API_URL") || "").replace(/\/+$/, "");
  const apiKey = Deno.env.get("EVOLUTION_GO_API_KEY") || "";

  if (!apiUrl || (!apiKey && !token)) {
    return { success: false, error: "Evolution Go API not configured" };
  }

  let lastResult: {
    success: boolean;
    status?: number;
    data?: any;
    error?: string | null;
  } = { success: false, error: "Notification not attempted" };

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(`${apiUrl}/send/text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": token || apiKey,
        "instanceId": instanceName,
      },
      body: JSON.stringify({ number, text }),
    });

    const responseText = await response.text();
    let data: any;
    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch (_error) {
      data = { message: responseText };
    }

    lastResult = {
      success: response.ok,
      status: response.status,
      data,
      error: response.ok ? null : data?.message || data?.error || "Failed to send Go notification",
    };

    if (response.ok || (response.status !== 429 && response.status < 500) || attempt === 3) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 350));
  }

  return lastResult;
}

function normalizePhone(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function phoneVariants(value: string | null | undefined) {
  const cleaned = normalizePhone(value);
  const withoutCountry = cleaned.startsWith("55") && cleaned.length >= 12 ? cleaned.slice(2) : cleaned;
  const variants = [cleaned, withoutCountry, withoutCountry ? `55${withoutCountry}` : ""].filter(Boolean);

  if (withoutCountry.length === 11 && withoutCountry[2] === "9") {
    const withoutNinth = `${withoutCountry.slice(0, 2)}${withoutCountry.slice(3)}`;
    variants.push(withoutNinth, `55${withoutNinth}`);
  } else if (withoutCountry.length === 10) {
    const withNinth = `${withoutCountry.slice(0, 2)}9${withoutCountry.slice(2)}`;
    variants.push(withNinth, `55${withNinth}`);
  }

  return [...new Set(variants)];
}

function getSentMessageId(data: any) {
  return (
    data?.key?.id ||
    data?.data?.key?.id ||
    data?.messageId ||
    data?.data?.messageId ||
    data?.id ||
    data?.data?.id ||
    null
  );
}

async function recordWhatsAppNotificationMessage(
  supabase: any,
  params: {
    organizationId?: string | null;
    session: any;
    phone: string;
    message: string;
    leadId?: string | null;
    goData: any;
  },
) {
  const { organizationId, session, phone, message, leadId, goData } = params;
  if (!organizationId || !session?.id || !phone || !message) return;

  const variants = phoneVariants(phone);
  const remoteJids = variants.flatMap((variant) => [`${variant}@s.whatsapp.net`, `${variant}@c.us`]);
  const canonicalPhone = variants.find((variant) => variant.startsWith("55")) || variants[0] || normalizePhone(phone);
  const canonicalRemoteJid = `${canonicalPhone}@s.whatsapp.net`;

  try {
    let lead: any = null;
    if (leadId) {
      const { data } = await supabase
        .from("leads")
        .select("id, name, phone, organization_id")
        .eq("id", leadId)
        .maybeSingle();
      if (data?.organization_id === organizationId) lead = data;
    }

    if (!lead) {
      const { data: leadMatches } = await supabase
        .from("leads")
        .select("id, name, phone, organization_id")
        .eq("organization_id", organizationId)
        .in("phone", variants)
        .limit(1);
      lead = leadMatches?.[0] || null;
    }

    let conversation: any = null;
    if (lead?.id) {
      const { data } = await supabase
        .from("whatsapp_conversations")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("lead_id", lead.id)
        .eq("is_group", false)
        .is("deleted_at", null)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      conversation = data || null;
    }

    if (!conversation) {
      const { data } = await supabase
        .from("whatsapp_conversations")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_group", false)
        .is("deleted_at", null)
        .or(`contact_phone.in.(${variants.join(",")}),remote_jid.in.(${remoteJids.join(",")})`)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      conversation = data || null;
    }

    if (!conversation) {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .insert({
          session_id: session.id,
          organization_id: organizationId,
          remote_jid: canonicalRemoteJid,
          contact_name: lead?.name || null,
          contact_phone: canonicalPhone,
          is_group: false,
          lead_id: lead?.id || null,
          last_message: message,
          last_message_at: new Date().toISOString(),
          unread_count: 0,
        })
        .select("*")
        .single();

      if (error) throw error;
      conversation = data;
    } else {
      const update: Record<string, unknown> = {
        session_id: session.id,
        remote_jid: conversation.remote_jid || canonicalRemoteJid,
        contact_phone: conversation.contact_phone || canonicalPhone,
        last_message: message,
        last_message_at: new Date().toISOString(),
        unread_count: 0,
        updated_at: new Date().toISOString(),
      };
      if (lead?.id && !conversation.lead_id) update.lead_id = lead.id;
      if (lead?.name && !conversation.contact_name) update.contact_name = lead.name;

      await supabase.from("whatsapp_conversations").update(update).eq("id", conversation.id);
    }

    const messageId = getSentMessageId(goData?.data || goData) || crypto.randomUUID();
    const { error: messageError } = await supabase.from("whatsapp_messages").insert({
      conversation_id: conversation.id,
      session_id: session.id,
      organization_id: session.organization_id,
      lead_id: lead?.id || conversation.lead_id || null,
      message_id: messageId,
      from_me: true,
      content: message,
      message_type: "text",
      status: "sent",
      sent_at: new Date().toISOString(),
      remote_jid: canonicalRemoteJid,
    });

    if (messageError) throw messageError;
  } catch (error) {
    console.warn("Could not record WhatsApp notification in CRM history:", error);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { organization_id, user_id, phone, message, lead_id } = await req.json();

    if (!message || (!organization_id && !user_id && !phone)) {
      return new Response(
        JSON.stringify({ success: false, error: "message and a target are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let notificationSession: any = null;
    let instanceName: string | null = null;
    let instanceToken: string | null = null;

    if (organization_id) {
      const { data: session } = await supabase
        .from("whatsapp_sessions")
        .select("id, instance_name, status, provider, advanced_settings")
        .eq("organization_id", organization_id)
        .eq("is_notification_session", true)
        .eq("status", "connected")
        .maybeSingle();

      if (session?.instance_name) {
        notificationSession = session;
        instanceName = session.instance_name;
        instanceToken = session.advanced_settings?.token || null;
        console.log("Using org notification session:", instanceName);
      }
    }

    if (!instanceName) {
      const { data: systemSettings } = await supabase
        .from("system_settings")
        .select("value")
        .limit(1)
        .maybeSingle();

      const settingsValue = (systemSettings?.value || {}) as Record<string, unknown>;
      const globalInstance = settingsValue.notification_instance_name as string | undefined;
      const globalToken = settingsValue.notification_instance_token as string | undefined;

      if (globalInstance) {
        const { data: globalSession } = await supabase
          .from("whatsapp_sessions")
          .select("id, instance_name, status, provider, advanced_settings")
          .eq("instance_name", globalInstance)
          .eq("status", "connected")
          .maybeSingle();

        notificationSession = globalSession || null;
        instanceName = globalSession?.instance_name || globalInstance;
        instanceToken = globalSession?.advanced_settings?.token || globalToken || null;
        console.log("Using global Evolution Go notification session:", instanceName);
      }
    }

    if (!instanceName) {
      const { data: globalGoSession } = await supabase
        .from("whatsapp_sessions")
        .select("id, instance_name, status, provider, advanced_settings")
        .eq("is_notification_session", true)
        .eq("status", "connected")
        .eq("provider", "evolution_go")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (globalGoSession?.instance_name) {
        notificationSession = globalGoSession;
        instanceName = globalGoSession.instance_name;
        instanceToken = globalGoSession.advanced_settings?.token || null;
        console.log("Using fallback Evolution Go notification session:", instanceName);
      }
    }

    if (!instanceName) {
      console.log("No notification instance available for org:", organization_id);
      return new Response(
        JSON.stringify({ success: false, error: "No notification instance configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let targetPhone = phone as string | undefined;
    let targetName = "Lead/Usuario";

    if (!targetPhone && user_id) {
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("whatsapp, name")
        .eq("id", user_id)
        .single();

      if (userError || !user?.whatsapp) {
        console.log("User not found or no WhatsApp:", user_id);
        return new Response(
          JSON.stringify({ success: false, error: "User has no WhatsApp number" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      targetPhone = user.whatsapp;
      targetName = user.name || targetName;
    }

    if (!targetPhone) {
      return new Response(
        JSON.stringify({ success: false, error: "user_id or phone is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const formattedPhone = targetPhone.replace(/\D/g, "");
    const goData = await sendEvolutionGoText(instanceName, formattedPhone, message, instanceToken);

    console.log("WhatsApp Go notification sent:", {
      user: targetName,
      phone: formattedPhone,
      instance: instanceName,
      provider: notificationSession?.provider || "evolution_go",
      status: goData.status,
      ok: goData.success,
    });

    if (!goData.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: goData.error || "Failed to send Go notification",
          data: goData.data,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await recordWhatsAppNotificationMessage(supabase, {
      organizationId: organization_id,
      session: notificationSession,
      phone: formattedPhone,
      message,
      leadId: lead_id || null,
      goData,
    });

    return new Response(
      JSON.stringify({ success: true, data: goData.data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("WhatsApp notifier error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
