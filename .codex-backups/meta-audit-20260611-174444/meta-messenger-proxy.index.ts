import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v25.0";
const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error("Invalid token");

    const body = await req.json();
    const { action, platform, recipientId, text, mediaUrl, conversationId } = body;

    console.log(`Meta Proxy Action: ${action}`, { platform, recipientId, conversationId });

    if (action === "sendMessage") {
      // 1. Find the integration to get the access token
      let pageId: string | null = null;
      let orgId: string | null = null;

      if (conversationId) {
        const { data: conversation } = await supabase
          .from("meta_conversations")
          .select("page_id, organization_id")
          .eq("id", conversationId)
          .single();
        
        if (conversation) {
          pageId = conversation.page_id;
          orgId = conversation.organization_id;
        }
      }

      if (!pageId) {
        // Fallback or if conversationId not provided
        const { data: integration } = await supabase
          .from("meta_integrations")
          .select("page_id, organization_id")
          .eq("is_connected", true)
          .limit(1)
          .single();
        
        if (integration) {
          pageId = integration.page_id;
          orgId = integration.organization_id;
        }
      }

      if (!pageId || !orgId) throw new Error("Could not determine page or organization");

      const { data: integration } = await supabase
        .from("meta_integrations")
        .select("access_token")
        .eq("page_id", pageId)
        .eq("organization_id", orgId)
        .single();

      if (!integration) throw new Error("Integration not found for this page");

      // 2. Send message via Graph API
      // Use different endpoint for Instagram vs Messenger if needed, 
      // but /me/messages works for both if the recipient ID is scoped correctly.
      const url = `${META_GRAPH_BASE_URL}/me/messages?access_token=${integration.access_token}`;
      
      const payload = {
        recipient: { id: recipientId },
        message: { text: text }
      };

      console.log("Sending message to Meta API...");
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (result.error) {
        console.error("Meta API Error:", result.error);
        throw new Error(result.error.message);
      }

      // 3. Record the message in our DB
      if (conversationId) {
        await supabase.from("meta_messages").insert({
          conversation_id: conversationId,
          external_id: result.message_id,
          content: text,
          message_type: "text",
          from_me: true,
          sent_at: new Date().toISOString()
        });

        // Update conversation last message
        await supabase.from("meta_conversations").update({
          last_message: text,
          last_message_at: new Date().toISOString()
        }).eq("id", conversationId);
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Meta Proxy Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
