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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { organization_id, user_id, phone, message } = await req.json();

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
