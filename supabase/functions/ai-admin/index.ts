import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BACKEND_URL = (Deno.env.get("VIMOB_BACKEND_URL") || "").replace(/\/+$/, "");
const BACKEND_SECRET = Deno.env.get("VIMOB_BACKEND_WEBHOOK_SECRET") || Deno.env.get("VIMOB_WEBHOOK_SECRET") || "";

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

async function isSuperAdmin(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;

  const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !userData.user) return false;

  const userId = userData.user.id;
  const { data: role } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();

  if (role) return true;

  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", userId)
    .eq("role", "super_admin")
    .maybeSingle();

  return !!profile;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!(await isSuperAdmin(req))) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!BACKEND_URL) {
      return new Response(JSON.stringify({ error: "backend_url_not_configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "preview";

    if (action !== "preview") {
      return new Response(JSON.stringify({ error: "unsupported_action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch(`${BACKEND_URL}/v1/ai/preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(BACKEND_SECRET ? { "X-Vimob-Webhook-Secret": BACKEND_SECRET } : {}),
      },
      body: JSON.stringify({
        organization_id: body.organization_id,
        message: body.message,
        use_openai: body.use_openai === true,
      }),
    });

    const text = await response.text();
    return new Response(text || "{}", {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ai-admin error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
