import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { organization_id, user_id, phone, message } = await req.json();

    if (!organization_id || !message) {
      return new Response(
        JSON.stringify({ success: false, error: "organization_id and message are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Try to find the organization's notification session
    let notificationSession: any = null;
    let instanceName: string | null = null;

    const { data: session } = await supabase
      .from("whatsapp_sessions")
      .select("id, instance_name, status, provider")
      .eq("organization_id", organization_id)
      .eq("is_notification_session", true)
      .single();

    if (session?.status === "connected" && session.instance_name) {
      notificationSession = session;
      instanceName = session.instance_name;
      console.log("Using org notification session:", instanceName);
    } else {
      // 2. Fallback: check global notification instance from system_settings
      const { data: systemSettings } = await supabase
        .from("system_settings")
        .select("value")
        .limit(1)
        .maybeSingle();

      if (systemSettings?.value) {
        const settingsValue = systemSettings.value as Record<string, unknown>;
        const globalInstance = settingsValue.notification_instance_name as string | undefined;
        if (globalInstance) {
          instanceName = globalInstance;
          console.log("Using global notification instance:", instanceName);
        }
      }
    }

    if (!instanceName) {
      console.log("No notification instance available for org:", organization_id);
      return new Response(
        JSON.stringify({ success: false, error: "No notification instance configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Get the target phone number
    let targetPhone = phone;
    let targetName = "Lead/Usuário";

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
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      targetPhone = user.whatsapp;
      targetName = user.name;
    }

    if (!targetPhone) {
      return new Response(
        JSON.stringify({ success: false, error: "user_id or phone is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Send the message via Evolution API
    const formattedPhone = targetPhone.replace(/\D/g, "");
    
    // Fetch organization name to add context if it's not already in the message
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", organization_id)
      .single();
    
    let finalMessage = message;
    if (org?.name && !message.includes(org.name)) {
      finalMessage = `${message}\n\n🏢 *Organização:* ${org.name}`;
    }

    if (notificationSession?.provider === "evolution_go") {
      const proxyResponse = await fetch(`${SUPABASE_URL}/functions/v1/evolution-go-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          action: "send.text",
          session_id: notificationSession.id,
          body: {
            number: formattedPhone,
            text: finalMessage,
          },
        }),
      });

      const proxyText = await proxyResponse.text();
      let proxyData;
      try {
        proxyData = JSON.parse(proxyText);
      } catch (_error) {
        proxyData = { message: proxyText };
      }

      console.log("WhatsApp Go notification sent:", {
        user: targetName,
        phone: formattedPhone,
        instance: instanceName,
        status: proxyResponse.status,
        ok: proxyData?.ok,
      });

      if (!proxyResponse.ok || proxyData?.ok === false) {
        return new Response(
          JSON.stringify({
            success: false,
            error: proxyData?.error || proxyData?.message || "Failed to send Go notification",
            data: proxyData,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: proxyData }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      console.error("Evolution API not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Evolution API not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: formattedPhone,
        text: finalMessage,
      }),
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      data = { message: responseText };
    }
    
    console.log("WhatsApp notification sent:", { user: targetName, phone: formattedPhone, instance: instanceName, status: response.status });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ success: false, error: data.message || "Failed to send notification" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("WhatsApp notifier error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
