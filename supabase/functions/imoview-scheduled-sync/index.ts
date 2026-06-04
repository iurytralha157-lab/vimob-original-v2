import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: integrations, error } = await supabase
      .from("imoview_integrations")
      .select("organization_id")
      .eq("is_active", true);

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integrations || integrations.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active Imoview integrations found", synced: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[imoview-scheduled-sync] Found ${integrations.length} active integrations`);

    const results: Array<{ organization_id: string; success: boolean; synced?: number; error?: string }> = [];

    for (const integration of integrations) {
      try {
        const { data, error: syncError } = await supabase.functions.invoke("imoview-sync", {
          body: { action: "sync", organization_id: integration.organization_id },
        });

        if (syncError) {
          results.push({ organization_id: integration.organization_id, success: false, error: syncError.message });
        } else {
          results.push({ organization_id: integration.organization_id, success: true, synced: data?.synced || 0 });
        }
      } catch (e) {
        results.push({ organization_id: integration.organization_id, success: false, error: e.message });
      }
    }

    const totalSynced = results.reduce((sum, r) => sum + (r.synced || 0), 0);

    return new Response(
      JSON.stringify({
        message: `Scheduled sync completed for ${integrations.length} integrations`,
        total_synced: totalSynced,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
