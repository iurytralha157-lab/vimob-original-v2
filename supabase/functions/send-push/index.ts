import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushRequest {
  user_id: string;
  title: string;
  message: string;
  url?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { user_id, title, message, url } = await req.json() as PushRequest;

    if (!user_id || !title || !message) {
      throw new Error("Missing required fields: user_id, title, message");
    }

    // Get VAPID keys from env
    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const mailto = Deno.env.get("VAPID_MAILTO") || "mailto:example@yourdomain.com";

    webpush.setVapidDetails(mailto, publicKey, privateKey);

    // Fetch subscription from DB
    const { data: subscriptionData, error: subError } = await supabase
      .from("push_subscriptions")
      .select("subscription")
      .eq("user_id", user_id)
      .single();

    if (subError || !subscriptionData) {
      console.log(`No subscription found for user ${user_id}`);
      return new Response(JSON.stringify({ success: false, message: "No subscription found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const payload = JSON.stringify({
      title,
      body: message,
      data: { url: url || "/" }
    });

    await webpush.sendNotification(subscriptionData.subscription, payload);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error sending push:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
