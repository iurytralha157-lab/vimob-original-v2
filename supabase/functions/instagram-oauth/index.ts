import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const IG_APP_ID = Deno.env.get("META_INSTAGRAM_APP_ID") || "";
const IG_APP_SECRET = Deno.env.get("META_INSTAGRAM_APP_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/instagram-oauth`;
const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
].join(",");

function redirectWithData(returnUrl: string, payload: Record<string, unknown>): Response {
  const encoded = encodeURIComponent(btoa(JSON.stringify(payload)));
  return new Response(null, {
    status: 302,
    headers: { Location: `${returnUrl}?ig_oauth_data=${encoded}` },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // OAuth callback from Instagram
  if (req.method === "GET") {
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const error = url.searchParams.get("error_description") || url.searchParams.get("error");

    let returnUrl = "https://vimob.vettercompany.com.br/settings/integrations/meta";
    let organizationId: string | null = null;
    try {
      if (stateParam) {
        const s = JSON.parse(atob(stateParam));
        if (s.returnUrl) returnUrl = s.returnUrl;
        if (s.organizationId) organizationId = s.organizationId;
      }
    } catch (_e) {
      // noop
    }

    if (error) return redirectWithData(returnUrl, { success: false, error });
    if (!code) return redirectWithData(returnUrl, { success: false, error: "Codigo nao recebido" });

    try {
      // Exchange code for short-lived token
      const form = new FormData();
      form.append("client_id", IG_APP_ID);
      form.append("client_secret", IG_APP_SECRET);
      form.append("grant_type", "authorization_code");
      form.append("redirect_uri", REDIRECT_URI);
      form.append("code", code);

      const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
        method: "POST",
        body: form,
      });
      const tokenData = await tokenRes.json();
      if (tokenData.error_message || tokenData.error) {
        console.error("IG token error:", tokenData);
        return redirectWithData(returnUrl, {
          success: false,
          error: tokenData.error_message || tokenData.error?.message || "Token error",
        });
      }

      const shortToken = tokenData.access_token;
      const igUserId = String(tokenData.user_id);

      // Exchange for long-lived token (60 days)
      const longRes = await fetch(
        `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${IG_APP_SECRET}&access_token=${shortToken}`,
      );
      const longData = await longRes.json();
      if (longData.error) {
        console.error("Long-lived token error:", longData);
        return redirectWithData(returnUrl, { success: false, error: longData.error.message });
      }

      const longToken = longData.access_token;

      // Fetch IG account info
      const meRes = await fetch(
        `https://graph.instagram.com/v21.0/me?fields=id,username,account_type,name&access_token=${longToken}`,
      );
      const me = await meRes.json();
      if (me.error) {
        console.error("IG me error:", me);
        return redirectWithData(returnUrl, { success: false, error: me.error.message });
      }

      // If state has org id, persist directly. Otherwise return data for frontend.
      if (organizationId) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await supabase.from("meta_integrations").upsert(
          {
            organization_id: organizationId,
            page_id: igUserId,
            page_name: me.username || me.name || "Instagram",
            access_token: longToken,
            instagram_business_account_id: igUserId,
            instagram_username: me.username || null,
            integration_type: "instagram",
            is_connected: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "organization_id,page_id" },
        );
      }

      return redirectWithData(returnUrl, {
        success: true,
        instagram_user_id: igUserId,
        username: me.username,
        account_type: me.account_type,
        access_token: longToken,
      });
    } catch (err) {
      console.error("IG OAuth callback failure:", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      return redirectWithData(returnUrl, { success: false, error: msg });
    }
  }

  // POST: actions from frontend
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userData } = await supabase
      .from("users")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!userData?.organization_id || userData.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, return_url, pipeline_id, stage_id, default_status, access_token, instagram_user_id, username } = body;

    switch (action) {
      case "get_auth_url": {
        const stateData = {
          returnUrl: return_url || "https://vimob.vettercompany.com.br/settings/integrations/meta",
          organizationId: userData.organization_id,
          ts: Date.now(),
        };
        const state = btoa(JSON.stringify(stateData));
        const authUrl = `https://www.instagram.com/oauth/authorize?` +
          `client_id=${IG_APP_ID}` +
          `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
          `&response_type=code` +
          `&scope=${encodeURIComponent(IG_SCOPES)}` +
          `&state=${encodeURIComponent(state)}`;
        return new Response(JSON.stringify({ auth_url: authUrl }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "save_account": {
        if (!instagram_user_id || !access_token) {
          return new Response(JSON.stringify({ error: "Missing instagram_user_id or access_token" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { error: upsertError } = await supabase.from("meta_integrations").upsert(
          {
            organization_id: userData.organization_id,
            page_id: String(instagram_user_id),
            page_name: username || "Instagram",
            access_token,
            instagram_business_account_id: String(instagram_user_id),
            instagram_username: username || null,
            integration_type: "instagram",
            pipeline_id: pipeline_id || null,
            stage_id: stage_id || null,
            default_status: default_status || "novo",
            is_connected: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "organization_id,page_id" },
        );
        if (upsertError) {
          return new Response(JSON.stringify({ error: upsertError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
