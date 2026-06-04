import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// This function is meant to be called by a cron job (pg_cron or external scheduler)
// It triggers vista-sync for ALL active Vista integrations automatically.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all active Vista integrations
    const { data: integrations, error } = await supabase
      .from("vista_integrations")
      .select("organization_id")
      .eq("is_active", true);

    if (error) {
      console.error("Error fetching vista integrations:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integrations || integrations.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active Vista integrations found", synced: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[vista-scheduled-sync] Found ${integrations.length} active integrations`);

    const results: Array<{ organization_id: string; success: boolean; synced?: number; error?: string }> = [];

    // Trigger sync for each integration sequentially to avoid overloading
    for (const integration of integrations) {
      try {
        console.log(`[vista-scheduled-sync] Syncing org: ${integration.organization_id}`);
        
        const { data, error: syncError } = await supabase.functions.invoke("vista-sync", {
          body: { action: "sync", organization_id: integration.organization_id },
        });

        if (syncError) {
          console.error(`[vista-scheduled-sync] Error for org ${integration.organization_id}:`, syncError);
          results.push({ organization_id: integration.organization_id, success: false, error: syncError.message });
        } else {
          console.log(`[vista-scheduled-sync] Org ${integration.organization_id} synced: ${data?.synced || 0} properties`);
          results.push({ organization_id: integration.organization_id, success: true, synced: data?.synced || 0 });
        }
      } catch (e) {
        console.error(`[vista-scheduled-sync] Exception for org ${integration.organization_id}:`, e);
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
    console.error("[vista-scheduled-sync] Fatal error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
