// ⚠️ ESTE FLUXO É EXCLUSIVO DO FACEBOOK (Páginas + Anúncios + Lead Ads).
// NÃO adicione escopos `instagram_*` ou `instagram_basic` aqui.
// A permissão do Instagram foi removida deste fluxo conforme solicitado.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_APP_ID = Deno.env.get("META_APP_ID") || "";
const META_APP_SECRET = Deno.env.get("META_APP_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const META_GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v25.0";
const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const META_DIALOG_BASE_URL = `https://www.facebook.com/${META_GRAPH_VERSION}`;
const MAX_META_FORM_PAGES = 30;

function generateSuccessPage(payload: Record<string, unknown>, returnUrl: string): Response {
  const encodedData = encodeURIComponent(JSON.stringify(payload));
  const safeReturnUrl = JSON.stringify(`${returnUrl}${returnUrl.includes("?") ? "&" : "?"}meta_oauth_data=${encodedData}`);

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="content-type" content="text/html; charset=utf-8" />
  <title>Facebook conectado</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f0f10; color: #fff; }
    .box { text-align: center; max-width: 420px; padding: 32px; }
    .icon { width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 18px; display: grid; place-items: center; background: #1877f2; font-weight: 800; font-size: 30px; }
    p { color: #b9b9b9; }
  </style>
</head>
<body>
  <div class="box">
    <div class="icon">f</div>
    <h2>Conta conectada</h2>
    <p>Voltando para o Vimob para concluir a configuracao.</p>
  </div>
  <script>
    const payload = ${JSON.stringify(payload)};
    if (window.opener) {
      window.opener.postMessage({ type: 'META_OAUTH_SUCCESS', data: payload }, '*');
      window.close();
    } else {
      window.location.href = ${safeReturnUrl};
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      ...corsHeaders,
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

// Redirect to frontend with success data
function redirectWithSuccess(pages: any[], userToken: string, returnUrl: string, adAccountId?: string | null, facebookUser?: any): Response {
  const data = {
    success: true,
    pages: pages,
    user_token: userToken,
    userToken: userToken,
    adAccountId: adAccountId,
    facebook_user_id: facebookUser?.id || null,
    facebook_user_name: facebookUser?.name || null,
  };
  const encodedData = encodeURIComponent(JSON.stringify(data));
  const separator = returnUrl.includes("?") ? "&" : "?";
  const redirectUrl = `${returnUrl}${separator}meta_oauth_data=${encodedData}`;

  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      Location: redirectUrl,
      "cache-control": "no-store",
    },
  });
}

async function fetchLeadFormsCollection(pageId: string, accessToken: string, status?: string): Promise<any[]> {
  const forms: any[] = [];
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "id,name,status,leads_count,questions",
    limit: "100",
  });

  if (status) {
    params.set("filtering", JSON.stringify([{ field: "status", operator: "EQUAL", value: status }]));
  }

  let nextUrl =
    `${META_GRAPH_BASE_URL}/${pageId}/leadgen_forms?` +
    params.toString();

  for (let page = 0; nextUrl && page < MAX_META_FORM_PAGES; page += 1) {
    const response = await fetch(nextUrl);
    const payload = await response.json();

    if (payload.error) throw payload.error;

    forms.push(...(payload.data || []));
    nextUrl = payload.paging?.next || "";
  }

  return forms;
}

async function fetchAllLeadForms(pageId: string, accessToken: string): Promise<any[]> {
  const byId = new Map<string, any>();
  const addForms = (forms: any[]) => {
    for (const form of forms) {
      if (form?.id) byId.set(form.id, form);
    }
  };

  addForms(await fetchLeadFormsCollection(pageId, accessToken));

  // Meta can hide archived/draft lead forms from the default listing.
  // Fetching statuses explicitly keeps old reusable forms visible in the CRM wizard.
  for (const status of ["ACTIVE", "ARCHIVED", "DRAFT"]) {
    try {
      addForms(await fetchLeadFormsCollection(pageId, accessToken, status));
    } catch (statusError) {
      console.warn(`Could not fetch Meta lead forms with status ${status}:`, statusError);
    }
  }

  return Array.from(byId.values());
}

// Redirect to frontend with error
function redirectWithError(error: string, returnUrl: string): Response {
  const data = {
    success: false,
    error: error
  };
  const encodedData = encodeURIComponent(JSON.stringify(data));
  const separator = returnUrl.includes("?") ? "&" : "?";
  const redirectUrl = `${returnUrl}${separator}meta_oauth_data=${encodedData}`;

  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      Location: redirectUrl,
      "cache-control": "no-store",
    },
  });
}

// Generate HTML page for errors
function generateErrorPage(error: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Erro na conexão</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 2rem;
      max-width: 400px;
    }
    .icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }
    h2 { margin-bottom: 0.5rem; }
    p { opacity: 0.9; margin-bottom: 1rem; }
    .error-detail {
      background: rgba(0,0,0,0.2);
      padding: 1rem;
      border-radius: 8px;
      font-size: 0.875rem;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">❌</div>
    <h2>Erro na conexão</h2>
    <p>Não foi possível conectar sua conta do Facebook.</p>
    <div class="error-detail">${error}</div>
    <p style="margin-top: 1rem;">Você pode fechar esta janela e tentar novamente.</p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'META_OAUTH_ERROR', error: ${JSON.stringify(error)} }, '*');
    }
  </script>
</body>
</html>`;
}

serve(async (req) => {
  const url = new URL(req.url);
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle OAuth callback (GET request from Facebook)
  if (req.method === "GET") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");
    
    // Parse state to get return URL
    let returnUrl = "https://vimob.vettercompany.com.br/settings/integrations/meta";
    try {
      if (state) {
        const stateData = JSON.parse(atob(state));
        if (stateData.returnUrl) {
          returnUrl = stateData.returnUrl;
        }
      }
    } catch (e) {
      console.log("Could not parse state, using default return URL");
    }
    
    console.log("OAuth callback received", { hasCode: !!code, error, errorDescription, returnUrl });
    
    if (error) {
      console.error("OAuth error from Facebook:", error, errorDescription);
      return redirectWithError(errorDescription || error, returnUrl);
    }
    
    if (!code) {
      return redirectWithError("Codigo de autorizacao nao recebido", returnUrl);
    }
    
    try {
      // The redirect_uri must match exactly what was used in the auth request
      const redirectUri = `${SUPABASE_URL}/functions/v1/meta-oauth`;
      
      // Exchange code for access token
      console.log("Exchanging code for token...");
      const tokenUrl = `${META_GRAPH_BASE_URL}/oauth/access_token?` +
        `client_id=${META_APP_ID}` +
        `&client_secret=${META_APP_SECRET}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&code=${code}`;

      const tokenResponse = await fetch(tokenUrl);
      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        console.error("Token exchange error:", tokenData.error);
        return redirectWithError(tokenData.error.message, returnUrl);
      }

      console.log("Token obtained, exchanging for long-lived token...");
      
      // Exchange for long-lived token
      const longLivedUrl = `${META_GRAPH_BASE_URL}/oauth/access_token?` +
        `grant_type=fb_exchange_token` +
        `&client_id=${META_APP_ID}` +
        `&client_secret=${META_APP_SECRET}` +
        `&fb_exchange_token=${tokenData.access_token}`;

      const longLivedResponse = await fetch(longLivedUrl);
      const longLivedData = await longLivedResponse.json();

      if (longLivedData.error) {
        console.error("Long-lived token error:", longLivedData.error);
        return redirectWithError(longLivedData.error.message, returnUrl);
      }

      console.log("Long-lived token obtained, fetching user and pages...");

      let facebookUser: any = null;
      try {
        const meResponse = await fetch(`${META_GRAPH_BASE_URL}/me?fields=id,name&access_token=${longLivedData.access_token}`);
        const meData = await meResponse.json();
        if (!meData.error) facebookUser = meData;
      } catch (meError) {
        console.warn("Could not fetch Facebook user profile:", meError);
      }
      
      // Get pages the user manages
      const pagesUrl = `${META_GRAPH_BASE_URL}/me/accounts?` +
        `access_token=${longLivedData.access_token}` +
        `&fields=id,name,access_token,picture`;

      const pagesResponse = await fetch(pagesUrl);
      const pagesData = await pagesResponse.json();

      if (pagesData.error) {
        console.error("Pages fetch error:", pagesData.error);
        return redirectWithError(pagesData.error.message, returnUrl);
      }

      const pages = (pagesData.data || []).map((page: any) => ({
        id: page.id,
        name: page.name,
        access_token: page.access_token,
        picture: page.picture,
        facebook_user_id: facebookUser?.id || null,
        facebook_user_name: facebookUser?.name || null,
      }));
      
      console.log(`Found ${pages.length} pages, fetching ad accounts...`);

      // NEW: Also fetch ad accounts to find the one associated with this user
      let ad_account_id = null;
      try {
        const adAccountsUrl = `${META_GRAPH_BASE_URL}/me/adaccounts?` +
          `access_token=${longLivedData.access_token}` +
          `&fields=id,name,account_id`;
        
        const adAccountsResponse = await fetch(adAccountsUrl);
        const adAccountsData = await adAccountsResponse.json();
        
        if (adAccountsData.data && adAccountsData.data.length > 0) {
          // We'll pass the first one as a suggestion or default
          ad_account_id = adAccountsData.data[0].id;
          console.log("Found ad account:", ad_account_id);
        }
      } catch (adError) {
        console.error("Error fetching ad accounts during OAuth:", adError);
      }

      console.log(`Found ${pages.length} pages, redirecting back...`);
      return redirectWithSuccess(pages, longLivedData.access_token, returnUrl, ad_account_id, facebookUser);
      
    } catch (error: unknown) {
      console.error("OAuth callback error:", error);
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      return redirectWithError(message, returnUrl);
    }
  }

  // Handle POST requests (existing API)
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's organization
    const { data: userData, error: profileError } = await supabase
      .from("users")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !userData?.organization_id) {
      return new Response(JSON.stringify({ error: "User not in organization" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only admins can manage Meta integration
    if (userData.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      action,
      code,
      redirect_uri,
      page_id,
      pipeline_id,
      stage_id,
      default_status,
      access_token,
      is_active,
      return_url,
      ad_account_id,
      facebook_user_id,
      facebook_user_name,
      page_picture_url,
    } = body;

    switch (action) {
      case "get_auth_url": {
        // Generate OAuth URL for Meta - redirect to this edge function
        const callbackUrl = `${SUPABASE_URL}/functions/v1/meta-oauth`;
        
        // Create state with return URL
        const stateData = {
          returnUrl: return_url || "https://vimob.vettercompany.com.br/settings/integrations/meta",
          timestamp: Date.now()
        };
        const state = btoa(JSON.stringify(stateData));
        
        const scopes = [
          "pages_show_list",
          "pages_read_engagement",
          "pages_manage_ads",
          "pages_manage_metadata",
          "leads_retrieval",
          "ads_management",
          "business_management",
        ].join(",");

        const authUrl = `${META_DIALOG_BASE_URL}/dialog/oauth?` +
          `client_id=${META_APP_ID}` +
          `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
          `&scope=${encodeURIComponent(scopes)}` +
          `&state=${encodeURIComponent(state)}` +
          `&response_type=code`;

        console.log("Generated auth URL with callback:", callbackUrl, "returnUrl:", stateData.returnUrl);

        return new Response(JSON.stringify({ auth_url: authUrl }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get_page_forms": {
        console.log("Fetching forms for page:", page_id);
        
        // Get access token from integration
        const { data: integration, error: intError } = await supabase
          .from("meta_integrations")
          .select("access_token, page_name")
          .eq("organization_id", userData.organization_id)
          .eq("page_id", page_id)
          .single();

        if (intError || !integration?.access_token) {
          console.error("Integration not found:", intError);
          return new Response(JSON.stringify({ error: "Integration not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log("Found integration for page:", integration.page_name);

        console.log("Fetching all forms from Meta API...");
        let metaForms: any[] = [];

        try {
          metaForms = await fetchAllLeadForms(page_id, integration.access_token);
        } catch (rawError) {
          const metaError = rawError as any;
          console.error("Meta API error:", metaError);
          const errorMessage = metaError?.message || "Erro ao buscar formularios no Meta";
          
          // Update integration with error
          await supabase
            .from("meta_integrations")
            .update({ 
              last_error: errorMessage,
              updated_at: new Date().toISOString()
            })
            .eq("organization_id", userData.organization_id)
            .eq("page_id", page_id);
          
          return new Response(JSON.stringify({ 
            error: errorMessage,
            error_code: metaError?.code,
            error_subcode: metaError?.error_subcode
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`Found ${metaForms.length || 0} forms`);

        const forms = metaForms.map((form: any) => ({
          id: form.id,
          name: form.name || form.id,
          status: form.status || "UNKNOWN",
          leads_count: form.leads_count,
          questions: (form.questions || []).map((q: any) => ({
            key: q.key,
            label: q.label,
            type: q.type,
          })),
        }));

        return new Response(JSON.stringify({ forms }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "exchange_token": {
        // Exchange code for access token
        const tokenUrl = `${META_GRAPH_BASE_URL}/oauth/access_token?` +
          `client_id=${META_APP_ID}` +
          `&client_secret=${META_APP_SECRET}` +
          `&redirect_uri=${encodeURIComponent(redirect_uri)}` +
          `&code=${code}`;

        const tokenResponse = await fetch(tokenUrl);
        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
          return new Response(JSON.stringify({ error: tokenData.error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Exchange for long-lived token
        const longLivedUrl = `${META_GRAPH_BASE_URL}/oauth/access_token?` +
          `grant_type=fb_exchange_token` +
          `&client_id=${META_APP_ID}` +
          `&client_secret=${META_APP_SECRET}` +
          `&fb_exchange_token=${tokenData.access_token}`;

        const longLivedResponse = await fetch(longLivedUrl);
        const longLivedData = await longLivedResponse.json();

        if (longLivedData.error) {
          return new Response(JSON.stringify({ error: longLivedData.error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get pages the user manages
        const pagesUrl = `${META_GRAPH_BASE_URL}/me/accounts?` +
          `access_token=${longLivedData.access_token}` +
          `&fields=id,name,access_token,picture`;

        const pagesResponse = await fetch(pagesUrl);
        const pagesData = await pagesResponse.json();

        if (pagesData.error) {
          return new Response(JSON.stringify({ error: pagesData.error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const meResponse = await fetch(`${META_GRAPH_BASE_URL}/me?fields=id,name&access_token=${longLivedData.access_token}`);
        const meData = await meResponse.json();

        return new Response(JSON.stringify({ 
          pages: pagesData.data || [],
          user_token: longLivedData.access_token,
          facebook_user_id: meData?.id || null,
          facebook_user_name: meData?.name || null,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "connect_page": {
        // First, get the page access token from user token (code contains user_token in this case)
        const pagesUrl = `${META_GRAPH_BASE_URL}/me/accounts?` +
          `access_token=${code}` +
          `&fields=id,name,access_token,picture`;

        const pagesResponse = await fetch(pagesUrl);
        const pagesData = await pagesResponse.json();

        if (pagesData.error) {
          return new Response(JSON.stringify({ error: pagesData.error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const page = pagesData.data?.find((p: any) => p.id === page_id);
        if (!page) {
          return new Response(JSON.stringify({ error: "Page not found or no access" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        let resolvedFacebookUserId = facebook_user_id || null;
        let resolvedFacebookUserName = facebook_user_name || null;
        if (!resolvedFacebookUserId || !resolvedFacebookUserName) {
          try {
            const meResponse = await fetch(`${META_GRAPH_BASE_URL}/me?fields=id,name&access_token=${code}`);
            const meData = await meResponse.json();
            resolvedFacebookUserId = resolvedFacebookUserId || meData?.id || null;
            resolvedFacebookUserName = resolvedFacebookUserName || meData?.name || null;
          } catch (meError) {
            console.warn("Could not resolve Facebook user for page connection:", meError);
          }
        }
        const resolvedPagePictureUrl = page_picture_url || page.picture?.data?.url || null;

        // NEW: If ad_account_id is not provided, try to fetch it automatically
        let ad_account_id = body.ad_account_id;
        if (!ad_account_id) {
          console.log("Ad account ID not provided, attempting to fetch automatically...");
          try {
            const adAccountsUrl = `${META_GRAPH_BASE_URL}/me/adaccounts?` +
              `access_token=${code}` +
              `&fields=id,name,account_id`;
            
            const adAccountsResponse = await fetch(adAccountsUrl);
            const adAccountsData = await adAccountsResponse.json();
            
            if (adAccountsData.data && adAccountsData.data.length > 0) {
              ad_account_id = adAccountsData.data[0].id;
              console.log("Automatically found ad account during connect_page:", ad_account_id);
            }
          } catch (adError) {
            console.error("Error fetching ad accounts during connect_page:", adError);
          }
        }

        // Subscribe to webhooks
        // FASE 1: Leadgen (Obrigatório para Lead Ads)
        console.log("Subscribing to leadgen webhook for page:", page_id);
        const subscribeUrl = `${META_GRAPH_BASE_URL}/${page_id}/subscribed_apps`;
        
        let leadgenSuccess = false;
        let messengerSuccess = false;
        let messengerError = null;
        let tokenPermissions: string[] = [];

        // Log token permissions for debugging
        try {
          const permUrl = `${META_GRAPH_BASE_URL}/me/permissions?access_token=${page.access_token}`;
          const permRes = await fetch(permUrl);
          const permData = await permRes.json();
          if (permData.data) {
            tokenPermissions = permData.data.filter((p: any) => p.status === "granted").map((p: any) => p.permission);
            console.log(`Page token permissions: ${tokenPermissions.join(", ")}`);
          }
        } catch (e) {
          console.warn("Could not fetch token permissions:", e);
        }

        try {
          // Inscrição primária: leadgen + feed (campos básicos para leads)
          console.log(`Subscribing to fields: leadgen,feed for page_id: ${page_id}`);
          const leadgenResponse = await fetch(subscribeUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              access_token: page.access_token,
              subscribed_fields: "leadgen,feed"
            }).toString()
          });
          const leadgenData = await leadgenResponse.json();
          
          if (leadgenData.success || !leadgenData.error) {
            leadgenSuccess = true;
            console.log(`Leadgen subscription success for page ${page_id}`);
          } else {
            console.error(`Leadgen subscription failed for page ${page_id}:`, leadgenData.error);
            return new Response(JSON.stringify({
              error: leadgenData.error?.message || "Não foi possível inscrever a página no webhook para leads.",
              error_code: leadgenData.error?.code,
            }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        } catch (subErr) {
          console.error(`Leadgen subscription request failed for page ${page_id}:`, subErr);
          return new Response(JSON.stringify({
            error: "Falha de rede ao inscrever a página no webhook do Meta.",
            details: (subErr as Error).message,
          }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // FASE 2: Messenger (Opcional - Não bloqueia a conexão de leads)
        if (leadgenSuccess) {
          const hasMessagingPermission = tokenPermissions.includes("pages_messaging");
          console.log(`Checking for Messenger permissions: ${hasMessagingPermission ? "YES" : "NO"}`);
          
          if (hasMessagingPermission) {
            try {
              console.log(`Attempting to add Messenger fields (messages,messaging_postbacks) for page ${page_id}`);
              const messengerResponse = await fetch(subscribeUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                  access_token: page.access_token,
                  subscribed_fields: "leadgen,feed,messages,messaging_postbacks"
                }).toString()
              });
              const messengerData = await messengerResponse.json();
              
              if (messengerData.success || !messengerData.error) {
                messengerSuccess = true;
                console.log(`Messenger subscription success for page ${page_id}`);
              } else {
                messengerError = messengerData.error?.message;
                console.log(`Messenger subscription failed for page ${page_id}:`, messengerError);
              }
            } catch (e) {
              console.warn(`Messenger subscription attempt failed for page ${page_id} (non-blocking):`, e);
            }
          } else {
            console.log(`Skipping Messenger subscription for page ${page_id} due to missing pages_messaging permission`);
            messengerError = "Missing pages_messaging permission";
          }
        }



        // Upsert integration (somente após webhook OK)
        const { error: upsertError } = await supabase
          .from("meta_integrations")
          .upsert({
            organization_id: userData.organization_id,
            page_id: page.id,
            page_name: page.name,
            access_token: page.access_token,
            ad_account_id: ad_account_id || null,
            selected_ad_accounts: body.selected_ad_accounts || [],
            pipeline_id: pipeline_id || null,
            stage_id: stage_id || null,
            default_status: default_status || null,
            facebook_user_id: resolvedFacebookUserId,
            facebook_user_name: resolvedFacebookUserName,
            page_picture_url: resolvedPagePictureUrl,
            is_connected: true,
            updated_at: new Date().toISOString()
          }, {
            onConflict: "organization_id,page_id"
          });

        if (upsertError) {
          // Try insert if upsert fails
          const { error: insertError } = await supabase
            .from("meta_integrations")
            .insert({
              organization_id: userData.organization_id,
              page_id: page.id,
              page_name: page.name,
              access_token: page.access_token,
              pipeline_id: pipeline_id || null,
              stage_id: stage_id || null,
              default_status: default_status || null,
              facebook_user_id: resolvedFacebookUserId,
              facebook_user_name: resolvedFacebookUserName,
              page_picture_url: resolvedPagePictureUrl,
              is_connected: true
            });

          if (insertError) {
            return new Response(JSON.stringify({ error: insertError.message }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        return new Response(JSON.stringify({ 
          success: true,
          messenger_active: messengerSuccess,
          messenger_error: messengerError
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update_page": {
        // Update page configuration
        const { error: updateError } = await supabase
          .from("meta_integrations")
          .update({
            pipeline_id,
            stage_id,
            default_status,
            selected_ad_accounts: body.selected_ad_accounts || [],
            updated_at: new Date().toISOString()
          })
          .eq("organization_id", userData.organization_id)
          .eq("page_id", page_id);

        if (updateError) {
          return new Response(JSON.stringify({ error: updateError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "disconnect_page": {
        // Disconnect specific page
        const { error: deleteError } = await supabase
          .from("meta_integrations")
          .delete()
          .eq("organization_id", userData.organization_id)
          .eq("page_id", page_id);

        if (deleteError) {
          return new Response(JSON.stringify({ error: deleteError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "toggle_page": {
        const { error: toggleError } = await supabase
          .from("meta_integrations")
          .update({ 
            is_connected: is_active !== false,
            updated_at: new Date().toISOString()
          })
          .eq("organization_id", userData.organization_id)
          .eq("page_id", page_id);

        if (toggleError) {
          return new Response(JSON.stringify({ error: toggleError.message }), {
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
  } catch (error: unknown) {
    console.error("Meta OAuth Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
