import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function leadRepliedAfter(
  supabase: any,
  organizationId: string,
  leadId: string | null | undefined,
  since: string | null | undefined,
) {
  if (!leadId || !since) return false;

  const { data: conversations, error: convError } = await supabase
    .from("whatsapp_conversations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("lead_id", leadId)
    .is("deleted_at", null);

  if (convError) {
    console.error(`Error checking conversations for lead ${leadId}:`, convError);
    return false;
  }

  const conversationIds = (conversations || []).map((conversation: { id: string }) => conversation.id);
  if (!conversationIds.length) return false;

  const { data: reply, error: replyError } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .in("conversation_id", conversationIds)
    .eq("from_me", false)
    .gt("sent_at", since)
    .limit(1)
    .maybeSingle();

  if (replyError) {
    console.error(`Error checking replies for lead ${leadId}:`, replyError);
    return false;
  }

  return !!reply;
}

/**
 * Automation Delay Processor
 * 
 * This function is called by a cron job every minute to process
 * automation executions that are in "waiting" status and ready to continue.
 * 
 * It checks for executions where:
 * - status = 'waiting'
 * - next_execution_at <= NOW()
 * 
 * For each ready execution, it:
 * 1. Updates status to 'running'
 * 2. Calls automation-executor to continue processing
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log("🕐 Automation delay processor started");

    // --- Process Schedule Notifications ---
    try {
      console.log("🔔 Triggering notification-scheduler...");
      const schedulerRes = await fetch(`${SUPABASE_URL}/functions/v1/notification-scheduler`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });
      console.log(`🔔 Notification scheduler response: ${schedulerRes.status}`);
    } catch (schedErr) {
      console.error("❌ Error triggering notification-scheduler:", schedErr);
    }

    // ─── Recovery sweep: mark stuck executions as failed ───────────────
    try {
      const { data: recovered, error: recErr } = await supabase.rpc("recover_stuck_executions", {
        p_stale_minutes: 10,
      });
      if (!recErr && recovered && recovered > 0) {
        console.log(`♻️ Recovered ${recovered} stuck execution(s)`);
      }
    } catch (recErr) {
      console.warn("recover_stuck_executions RPC unavailable:", recErr);
    }

    // Find all executions ready to continue
    const now = new Date().toISOString();
    const { data: waitingExecutions, error: fetchError } = await supabase
      .from("automation_executions")
      .select("id, automation_id, current_node_id, organization_id, lead_id, started_at")
      .eq("status", "waiting")
      .lte("next_execution_at", now)
      .limit(50); // Process max 50 at a time to avoid timeout

    if (fetchError) {
      console.error("Error fetching waiting executions:", fetchError);
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!waitingExecutions || waitingExecutions.length === 0) {
      console.log("✅ No waiting executions to process");
      return new Response(
        JSON.stringify({ success: true, processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📋 Found ${waitingExecutions.length} executions ready to continue`);

    let processedCount = 0;
    let errorCount = 0;

    // Process each execution
    for (const execution of waitingExecutions) {
      try {
        console.log(`🔄 Processing execution ${execution.id}`);

        const hasReply = await leadRepliedAfter(
          supabase,
          execution.organization_id,
          execution.lead_id,
          execution.started_at,
        );

        if (hasReply) {
          console.log(`Cancelling execution ${execution.id}: lead replied while automation was waiting`);
          const { error: cancelError } = await supabase
            .from("automation_executions")
            .update({
              status: "cancelled",
              completed_at: new Date().toISOString(),
              next_execution_at: null,
              error_message: "Cancelado: lead respondeu durante a espera",
            })
            .eq("id", execution.id)
            .eq("status", "waiting");

          if (cancelError) {
            console.error(`Error cancelling replied execution ${execution.id}:`, cancelError);
            errorCount++;
          } else {
            processedCount++;
          }
          continue;
        }

        // Update status to running
        const { error: updateError } = await supabase
          .from("automation_executions")
          .update({
            status: "running",
            next_execution_at: null,
          })
          .eq("id", execution.id)
          .eq("status", "waiting"); // Ensure we don't double-process

        if (updateError) {
          console.error(`Error updating execution ${execution.id}:`, updateError);
          errorCount++;
          continue;
        }

        // Call automation-executor to continue processing
        const executorResponse = await fetch(`${SUPABASE_URL}/functions/v1/automation-executor`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ execution_id: execution.id }),
        });

        if (!executorResponse.ok) {
          const errorText = await executorResponse.text();
          console.error(`Error calling executor for ${execution.id}:`, errorText);
          
          // Mark as failed if executor call fails
          await supabase
            .from("automation_executions")
            .update({
              status: "failed",
              error_message: `Executor error: ${errorText.substring(0, 500)}`,
              completed_at: new Date().toISOString(),
            })
            .eq("id", execution.id);
          
          errorCount++;
          continue;
        }

        const result = await executorResponse.json();
        console.log(`✅ Execution ${execution.id} continued:`, result);
        processedCount++;

      } catch (execError) {
        console.error(`Error processing execution ${execution.id}:`, execError);
        
        // Mark as failed
        await supabase
          .from("automation_executions")
          .update({
            status: "failed",
            error_message: execError instanceof Error ? execError.message : "Unknown error",
            completed_at: new Date().toISOString(),
          })
          .eq("id", execution.id);
        
        errorCount++;
      }
    }

    console.log(`🏁 Delay processor finished: ${processedCount} processed, ${errorCount} errors`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: processedCount, 
        errors: errorCount,
        total: waitingExecutions.length 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Automation delay processor error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
