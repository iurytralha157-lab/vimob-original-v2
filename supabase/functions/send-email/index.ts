import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const { to, template_key, variables, organization_id } = await req.json();

    // 1. Buscar configurações de e-mail (remetente)
    const { data: settings } = await supabase
      .from("notification_settings")
      .select("*")
      .eq("organization_id", organization_id)
      .maybeSingle();

    const fromName = settings?.from_name || "Vimob";
    const fromEmail = settings?.from_email || "onboarding@resend.dev";
    const replyTo = settings?.reply_to;

    // 2. Buscar template no banco (prioriza notification_templates que tem subject/html_body)
    let subject = "";
    let html = "";

    const { data: nt } = await supabase
      .from("notification_templates")
      .select("subject, html_body, message")
      .eq("slug", template_key)
      .maybeSingle();

    if (nt) {
      subject = nt.subject || "Notificação Vimob";
      html = nt.html_body || nt.message; // Fallback para message se html_body estiver vazio
    } else {
      // Fallback para email_templates antigo se existir
      const { data: et } = await supabase
        .from("email_templates")
        .select("*")
        .eq("key", template_key)
        .maybeSingle();
      
      if (et) {
        subject = et.subject;
        html = et.html;
      }
    }

    if (!html) {
      throw new Error(`Template not found or has no content: ${template_key}`);
    }

    // 3. Substituir variáveis
    if (variables) {
      Object.entries(variables).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}|{${key}}`, "g");
        subject = subject.replace(regex, String(value));
        html = html.replace(regex, String(value));
      });
    }

    // 4. Enviar via Resend
    if (!RESEND_API_KEY) {
       console.error("RESEND_API_KEY not found in environment variables");
       throw new Error("RESEND_API_KEY not configured");
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject: subject,
        html: html,
        reply_to: replyTo
      }),
    });

    const resData = await res.json();
    const status = res.ok ? "success" : "error";

    // 5. Salvar log
    await supabase.from("email_logs").insert({
      template_key,
      recipient_email: to,
      subject,
      status,
      error_message: res.ok ? null : JSON.stringify(resData),
    });

    if (!res.ok) {
      throw new Error(JSON.stringify(resData));
    }

    return new Response(JSON.stringify(resData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error in send-email function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});