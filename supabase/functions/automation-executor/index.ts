import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Max number of nodes processed in a single invocation (keeps us under
// the edge function CPU budget). Beyond this, the cron resumes.
const MAX_CHAIN_NODES = 10;

// Minimum delay (ms) — shorter delays are still scheduled, but the cron
// runs every ~30s so anything < ~5s effectively becomes "as soon as possible".
const MIN_SCHEDULABLE_DELAY_MS = 1000;

interface ExecutionPayload {
  execution_id: string;
}

interface EvolutionConnectionState {
  isConnected: boolean;
  state: string | null;
  raw: unknown;
  status: number;
}

type WhatsAppProvider = "evolution" | "evolution_go";

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

function getSentMessageId(data: any) {
  return data?.key?.id || data?.data?.key?.id || data?.messageId || data?.data?.messageId;
}

async function sendEvolutionGoAction(
  supabaseUrl: string,
  serviceRoleKey: string,
  sessionId: string,
  action: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(`${supabaseUrl}/functions/v1/evolution-go-proxy`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${serviceRoleKey}`,
      "apikey": serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action,
      session_id: sessionId,
      body,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || data?.data?.message || data?.message || "Failed to send message via Evolution Go");
  }

  return data?.data || data;
}

async function sendWhatsAppTextProviderAware(
  supabaseUrl: string,
  serviceRoleKey: string,
  evolutionApiUrl: string | undefined,
  evolutionApiKey: string | undefined,
  session: { id: string; instance_name: string; provider?: WhatsAppProvider | null },
  number: string,
  text: string,
) {
  if (session.provider === "evolution_go") {
    return sendEvolutionGoAction(supabaseUrl, serviceRoleKey, session.id, "send.text", { number, text });
  }

  if (!evolutionApiUrl || !evolutionApiKey) {
    throw new Error("Evolution API not configured");
  }

  return sendWhatsAppTextWithRetry(evolutionApiUrl, evolutionApiKey, session.instance_name, number, text);
}

// ────────────────────────────────────────────────────────────────────────────
// PHONE / EVOLUTION HELPERS (unchanged from v1)
// ────────────────────────────────────────────────────────────────────────────

function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits;
}

function isValidBrazilianWhatsAppNumber(phone: string | null | undefined): phone is string {
  if (!phone) return false;
  if (/<[^>]+>|dummy data|test lead|undefined|null/i.test(phone)) return false;

  const normalized = normalizePhoneNumber(phone);
  return /^55\d{10,11}$/.test(normalized);
}

async function getEvolutionConnectionState(
  evolutionApiUrl: string,
  evolutionApiKey: string,
  instanceName: string,
): Promise<EvolutionConnectionState> {
  const response = await fetch(`${evolutionApiUrl}/instance/connectionState/${instanceName}`, {
    method: "GET",
    headers: { apikey: evolutionApiKey },
  });
  const rawText = await response.text();
  let raw: unknown = rawText;
  try { raw = rawText ? JSON.parse(rawText) : null; } catch { raw = rawText; }
  const state = typeof raw === "object" && raw !== null
    ? ((raw as Record<string, unknown>).instance as Record<string, unknown> | undefined)?.state as string | undefined
      || (raw as Record<string, unknown>).state as string | undefined
      || null
    : null;
  return {
    isConnected: state === "open" || state === "connected",
    state,
    raw,
    status: response.status,
  };
}

async function sendWhatsAppTextWithRetry(
  evolutionApiUrl: string,
  evolutionApiKey: string,
  instanceName: string,
  number: string,
  text: string,
  maxAttempts = 3
) {
  const endpoint = `${evolutionApiUrl}/message/sendText/${instanceName}`;
  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxAttempts} to send WhatsApp text to ${number}...`);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evolutionApiKey },
        body: JSON.stringify({ number, text }),
      });

      const rawText = await response.text();
      let parsed: any;
      try { parsed = rawText ? JSON.parse(rawText) : { error: rawText }; } catch { parsed = { error: rawText }; }

      if (response.ok) return parsed;

      const payload = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
      
      // If it's a "Connection Closed" or transient error, we definitely want to retry
      if (payload.includes("Connection Closed") || response.status >= 500 || payload.includes("timeout")) {
        console.warn(`Transient error on attempt ${attempt}: ${payload}`);
        if (attempt < maxAttempts) {
          // Check connection state before retrying a closed connection
          if (payload.includes("Connection Closed")) {
            const live = await getEvolutionConnectionState(evolutionApiUrl, evolutionApiKey, instanceName);
            if (!live.isConnected) {
               throw new Error(`Sessão WhatsApp desconectada (${live.state})`);
            }
          }
          await new Promise((r) => setTimeout(r, 2000 * attempt));
          continue;
        }
      }
      
      throw new Error(payload);
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) break;
      
      // Don't retry if the error is "Session disconnected" or "Invalid number"
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("desconectada") || errMsg.includes("invalid") || errMsg.includes("exists\":false")) {
        break;
      }
      
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }

  throw lastError || new Error("Failed to send WhatsApp after multiple attempts");
}

// ────────────────────────────────────────────────────────────────────────────
// LOCK / IDEMPOTENCY HELPERS
// ────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function acquireLock(supabase: any, executionId: string): Promise<string | null> {
  // Try the new atomic RPC first
  try {
    const { data, error } = await supabase.rpc("try_acquire_execution_step_lock", {
      p_execution_id: executionId,
      p_max_lock_age_seconds: 300,
    });
    if (!error && data) return data as string;
    if (!error && data === null) {
      console.log(`🔒 Lock not acquired for ${executionId} (another worker holds it)`);
      return null;
    }
    // RPC missing → fallback below
    console.warn("try_acquire_execution_step_lock RPC unavailable, falling back to status check:", error?.message);
  } catch (err) {
    console.warn("Lock RPC threw, falling back:", err);
  }

  // Fallback: refuse if status is already running with a recent started_at
  const { data: exec } = await supabase
    .from("automation_executions")
    .select("status, started_at")
    .eq("id", executionId)
    .single();

  if (!exec) return null;
  if (exec.status === "completed" || exec.status === "failed" || exec.status === "cancelled") {
    return null;
  }
  // Pseudo-token for fallback mode
  return `fallback-${crypto.randomUUID()}`;
}

// deno-lint-ignore no-explicit-any
async function releaseLock(supabase: any, executionId: string, token: string) {
  if (token.startsWith("fallback-")) return;
  try {
    await supabase.rpc("release_execution_step_lock", {
      p_execution_id: executionId,
      p_token: token,
    });
  } catch (err) {
    console.warn("release_execution_step_lock failed (non-fatal):", err);
  }
}

/**
 * Attempts to claim the right to send a message for a (execution, node, attempt_key) triple.
 * Returns true if this caller is the first/only one — proceed with send.
 * Returns false if already dispatched — skip send.
 *
 * `attempt_key` is the node_id alone (one send per node per execution). This means
 * even if the executor is invoked 50x for the same node, only the first will send.
 */
// deno-lint-ignore no-explicit-any
async function claimDispatch(
  supabase: any,
  executionId: string,
  nodeId: string,
  organizationId: string,
  attemptKey?: string,
): Promise<boolean> {
  const key = attemptKey || nodeId;
  try {
    const { error } = await supabase
      .from("automation_message_dispatches")
      .insert({
        execution_id: executionId,
        node_id: nodeId,
        attempt_key: key,
        organization_id: organizationId,
      });
    if (!error) return true;
    // Unique violation → already dispatched
    if (error.code === "23505") {
      console.log(`🛑 Duplicate dispatch prevented for execution=${executionId} node=${nodeId}`);
      return false;
    }
    // Table missing? Allow send (best-effort) but warn loudly.
    if (error.code === "42P01") {
      console.warn("automation_message_dispatches table missing — running WITHOUT idempotency. Apply migration!");
      return true;
    }
    console.warn("claimDispatch unexpected error, allowing send:", error);
    return true;
  } catch (err) {
    console.warn("claimDispatch threw, allowing send:", err);
    return true;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// NODE CONFIG NORMALIZATION
// ────────────────────────────────────────────────────────────────────────────

function getNodeConfig(node: Record<string, unknown>): Record<string, unknown> {
  return (node.node_config as Record<string, unknown>) || (node.config as Record<string, unknown>) || {};
}

function getDelayMs(node: Record<string, unknown>): number {
  const cfg = getNodeConfig(node);
  // Support both `delay_*` (legacy) and `wait_*` (new)
  const type = (cfg.wait_type || cfg.delay_type) as string | undefined;
  const value = Number(cfg.wait_value ?? cfg.delay_value ?? 0) || 0;

  if (type && value > 0) {
    switch (type) {
      case "seconds": return value * 1000;
      case "minutes": return value * 60 * 1000;
      case "hours": return value * 60 * 60 * 1000;
      case "days": return value * 24 * 60 * 60 * 1000;
      default: return value * 60 * 1000;
    }
  }
  // Old format
  const m = Number(cfg.delay_minutes || cfg.minutes) || 0;
  const h = Number(cfg.delay_hours || cfg.hours) || 0;
  const d = Number(cfg.delay_days || cfg.days) || 0;
  return m * 60_000 + h * 3_600_000 + d * 86_400_000;
}

// ────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY
// ────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const payload: ExecutionPayload & { override_node?: any } = await req.json();
    const { execution_id, override_node } = payload;
    console.log(`📥 Executor invoked for execution_id=${execution_id}`);

    if (!execution_id) {
      return new Response(JSON.stringify({ success: false, error: "Missing execution_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Acquire lock atomically ──────────────────────────────────────────
    const lockToken = await acquireLock(supabase, execution_id);
    if (!lockToken) {
      console.log(`⏭️ Skipping ${execution_id} — locked or finalized`);
      return new Response(JSON.stringify({ success: true, message: "Skipped (locked or finalized)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let lockReleased = false;
    const safeRelease = async () => {
      if (!lockReleased) {
        lockReleased = true;
        await releaseLock(supabase, execution_id, lockToken);
      }
    };

    try {
      // ─── Fetch execution + automation graph ─────────────────────────────
      const { data: execution, error: execError } = await supabase
        .from("automation_executions")
        .select(`
          *,
          automation:automations(
            *,
            nodes:automation_nodes(*),
            connections:automation_connections(*)
          )
        `)
        .eq("id", execution_id)
        .single();

      if (execError || !execution) {
        console.error("Execution not found:", execError);
        await safeRelease();
        return new Response(JSON.stringify({ success: false, error: "Execution not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (["completed", "failed", "cancelled"].includes(execution.status)) {
        console.log(`Execution ${execution_id} already ${execution.status}`);
        await safeRelease();
        return new Response(JSON.stringify({ success: true, message: "Already finished" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const automation = execution.automation;
      const executionData = execution.execution_data || {};

      // Ensure status is `running` while we process
      await supabase
        .from("automation_executions")
        .update({ status: "running", next_execution_at: null })
        .eq("id", execution_id);

      // ─── Sequential node processing loop ────────────────────────────────
      let currentNodeId: string | null = execution.current_node_id;
      let processedCount = 0;
      let scheduledLater = false;

      while ((currentNodeId || override_node) && processedCount < MAX_CHAIN_NODES) {
        let currentNode = automation.nodes?.find((n: { id: string }) => n.id === currentNodeId);
        
        // If an override node is provided, process it first
        if (processedCount === 0 && override_node) {
          currentNode = {
            ...override_node,
            id: override_node.id || `override-${crypto.randomUUID()}`
          };
          console.log(`⚡ Processing OVERRIDE node: ${currentNode.node_type}`);
        }

        if (!currentNode) {
          console.error(`Node ${currentNodeId} not found in automation ${automation.id}`);
          await markFailed(supabase, execution_id, `Node not found: ${currentNodeId}`);
          await sendAutomationNotification(supabase, execution, automation, "failed", "Nó da automação não encontrado");
          break;
        }

        console.log(`▶️ [${processedCount + 1}/${MAX_CHAIN_NODES}] Processing ${currentNode.node_type} (${currentNode.action_type || "n/a"}) — ${currentNode.id}`);

        let nextNodeId: string | null = (processedCount === 0 && override_node) ? currentNodeId : null;

        try {
          switch (currentNode.node_type) {
            case "trigger": {
              // Should rarely happen (trigger is start node); just follow the connection
              const conn = automation.connections?.find(
                (c: { source_node_id: string }) => c.source_node_id === currentNodeId,
              );
              nextNodeId = conn?.target_node_id || null;
              break;
            }

            case "action": {
              await processActionNode(
                supabase,
                currentNode,
                execution,
                SUPABASE_URL,
                SUPABASE_SERVICE_ROLE_KEY,
                EVOLUTION_API_URL,
                EVOLUTION_API_KEY,
              );
              const conn = automation.connections?.find(
                (c: { source_node_id: string }) => c.source_node_id === currentNodeId,
              );
              nextNodeId = conn?.target_node_id || null;
              break;
            }

            case "condition": {
              const result = await evaluateCondition(supabase, getNodeConfig(currentNode), execution);
              console.log(`Condition → ${result}`);
              const conn = automation.connections?.find(
                (c: { source_node_id: string; condition_branch?: string }) =>
                  c.source_node_id === currentNodeId &&
                  c.condition_branch === (result ? "true" : "false"),
              );
              nextNodeId = conn?.target_node_id || null;
              break;
            }

            case "delay":
            case "wait": {
              const delayMs = getDelayMs(currentNode);
              const conn = automation.connections?.find(
                (c: { source_node_id: string; source_handle?: string }) =>
                  c.source_node_id === currentNodeId &&
                  (!c.source_handle || c.source_handle === "no_reply" || c.source_handle === "default"),
              ) || automation.connections?.find(
                (c: { source_node_id: string }) => c.source_node_id === currentNodeId,
              );

              if (!conn?.target_node_id) {
                console.log("Wait/delay has no outgoing connection → completing");
                nextNodeId = null;
                break;
              }

              if (delayMs >= MIN_SCHEDULABLE_DELAY_MS) {
                // Schedule via cron — set status=waiting, advance current_node_id to the next
                const nextExecAt = new Date(Date.now() + delayMs).toISOString();
                console.log(`⏱️ Scheduling resume at ${nextExecAt} (delay=${delayMs}ms)`);
                await supabase
                  .from("automation_executions")
                  .update({
                    status: "waiting",
                    current_node_id: conn.target_node_id,
                    next_execution_at: nextExecAt,
                    execution_data: executionData,
                  })
                  .eq("id", execution_id);
                scheduledLater = true;
                // Release lock so cron can pick it up later
                await safeRelease();
                return new Response(
                  JSON.stringify({ success: true, message: "Scheduled", next_execution_at: nextExecAt }),
                  { headers: { ...corsHeaders, "Content-Type": "application/json" } },
                );
              }
              // Negligible delay → continue immediately
              nextNodeId = conn.target_node_id;
              break;
            }

            default: {
              console.log(`Unknown node_type: ${currentNode.node_type} — skipping to next`);
              const conn = automation.connections?.find(
                (c: { source_node_id: string }) => c.source_node_id === currentNodeId,
              );
              nextNodeId = conn?.target_node_id || null;
            }
          }
        } catch (nodeErr) {
          const errMsg = nodeErr instanceof Error ? nodeErr.message : "Unknown node error";
          const translated = translateError(errMsg);
          console.error(`❌ Error processing node ${currentNodeId}:`, errMsg);
          
          await markFailed(supabase, execution_id, errMsg);
          await sendAutomationNotification(supabase, execution, automation, "failed", errMsg);
          await logAutomationActivity(supabase, execution.lead_id, "automation_error", 
            `Falha na automação "${automation.name}": ${translated}`, 
            { error: errMsg, node_id: currentNodeId });
          await safeRelease();
          return new Response(JSON.stringify({ success: false, error: errMsg }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        processedCount++;

        if (nextNodeId) {
          // Advance the pointer — atomic update
          await supabase
            .from("automation_executions")
            .update({ current_node_id: nextNodeId, execution_data: executionData })
            .eq("id", execution_id);
          currentNodeId = nextNodeId;
        } else {
          // End of flow
          const { error: completeError } = await supabase
            .from("automation_executions")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
              lock_token: null,
              locked_at: null,
            })
            .eq("id", execution_id);
          if (completeError) throw completeError;
          lockReleased = true; // we just nulled the lock
          console.log(`✅ Execution ${execution_id} completed`);
          await sendAutomationNotification(supabase, execution, automation, "completed");
          await logAutomationActivity(supabase, execution.lead_id, "automation_completed",
            `Automação "${automation.name}" concluída`, { automation_id: automation.id, execution_id });
          currentNodeId = null;
        }
      }

      // If we hit MAX_CHAIN_NODES without reaching end/wait, schedule the cron to pick up later
      if (currentNodeId && !scheduledLater) {
        console.log(`🔁 Reached MAX_CHAIN_NODES — yielding to cron at node ${currentNodeId}`);
        await supabase
          .from("automation_executions")
          .update({
            status: "waiting",
            next_execution_at: new Date(Date.now() + 1000).toISOString(),
          })
          .eq("id", execution_id);
      }

      await safeRelease();
      return new Response(JSON.stringify({ success: true, processed: processedCount }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (innerErr) {
      await safeRelease();
      throw innerErr;
    }
  } catch (error: unknown) {
    console.error("❌ Automation executor fatal:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function markFailed(supabase: any, executionId: string, error: string) {
  const { error: updateError } = await supabase
    .from("automation_executions")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: error,
      lock_token: null,
      locked_at: null,
    })
    .eq("id", executionId);

  if (updateError) {
    console.error("Failed to mark automation execution as failed:", updateError);
  }
}

function translateError(error: string): string {
  if (error.includes("Telefone WhatsApp invalido")) return "Telefone WhatsApp invalido ou de teste";
  if (error.includes("exists") && error.includes("false")) return "Número WhatsApp inválido ou não cadastrado";
  if (error.includes("Connection refused") || error.includes("ECONNREFUSED")) return "Falha na conexão com WhatsApp";
  if (error.includes("timeout") || error.includes("ETIMEDOUT")) return "Tempo limite excedido";
  if (error.includes("not connected") || error.includes("disconnected")) return "Sessão WhatsApp desconectada";
  return error.length > 200 ? error.substring(0, 200) + "..." : error;
}

// deno-lint-ignore no-explicit-any
async function sendAutomationNotification(
  supabase: any,
  execution: { lead_id?: string; organization_id: string },
  automation: { name: string; created_by?: string },
  status: "completed" | "failed",
  errorMessage?: string,
) {
  try {
    let leadName = "Lead";
    let notifyUserId: string | null = automation.created_by || null;
    let organizationName = "";

    // Check if user has multiple organizations
    if (notifyUserId) {
      const { count } = await supabase
        .from('organization_members')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', notifyUserId);
      
      if (count && count > 1) {
        const { data: org } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", execution.organization_id)
          .single();
        if (org) {
          organizationName = org.name;
        }
      }
    }

    if (execution.lead_id) {
      const { data: lead } = await supabase
        .from("leads").select("name, assigned_user_id").eq("id", execution.lead_id).single();
      if (lead) {
        leadName = lead.name || "Lead";
        notifyUserId = lead.assigned_user_id || automation.created_by || null;
      }
    }
    if (!notifyUserId) return;
    const isSuccess = status === "completed";
    const title = isSuccess ? "⚡ Automação Concluída" : "❌ Automação Falhou";
    const translated = errorMessage ? translateError(errorMessage) : "";
    
    const orgSuffix = organizationName ? ` na *${organizationName}*` : "";
    const content = isSuccess
      ? `A automação "${automation.name}" para o lead ${leadName} foi concluída com sucesso${orgSuffix}.`
      : `A automação "${automation.name}" para o lead ${leadName} falhou${orgSuffix}: ${translated}`;

    await supabase.from("notifications").insert({
      user_id: notifyUserId,
      organization_id: execution.organization_id,
      title, content, type: "automation",
      lead_id: execution.lead_id || null,
    });
  } catch (err) { console.error("Notification error:", err); }
}

// deno-lint-ignore no-explicit-any
async function logAutomationActivity(
  supabase: any,
  leadId: string | undefined,
  type: string,
  content: string,
  metadata: Record<string, unknown> = {},
) {
  if (!leadId) return;
  try {
    await supabase.from("activities").insert({
      lead_id: leadId, type, content,
      metadata: { ...metadata, is_automation: true },
      user_id: null,
    });
  } catch (err) { console.error("Activity log error:", err); }
}

// ────────────────────────────────────────────────────────────────────────────
// ACTION NODE PROCESSOR
// ────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function processActionNode(
  supabase: any,
  node: { id: string; action_type: string; node_config?: Record<string, unknown>; config?: Record<string, unknown> },
  execution: { id: string; lead_id?: string; conversation_id?: string; organization_id: string; started_at?: string },
  supabaseUrl: string,
  serviceRoleKey: string,
  evolutionApiUrl?: string,
  evolutionApiKey?: string,
) {
  const config = getNodeConfig(node);
  const actionType = node.action_type;

  console.log(`Action: ${actionType}`, { node_id: node.id });

  switch (actionType) {
    case "send_whatsapp": {
      const hasReply = await leadRepliedAfter(
        supabase,
        execution.organization_id,
        execution.lead_id,
        execution.started_at,
      );

      if (hasReply) {
        console.log(`Skipping send_whatsapp for execution ${execution.id}: lead replied after automation started`);
        await supabase
          .from("automation_executions")
          .update({
            status: "cancelled",
            completed_at: new Date().toISOString(),
            next_execution_at: null,
            error_message: "Cancelado: lead respondeu antes do envio",
          })
          .eq("id", execution.id);
        return;
      }
      // Idempotency claim FIRST — before any side-effect
      const claimed = await claimDispatch(supabase, execution.id, node.id, execution.organization_id);
      if (!claimed) {
        console.log(`🛑 Skipping send_whatsapp — already dispatched for node ${node.id}`);
        return;
      }

      const configuredSessionId = config.session_id as string | undefined;
      if (configuredSessionId) {
        const { data: session } = await supabase
          .from("whatsapp_sessions").select("*").eq("id", configuredSessionId).single();
        if (!session) { console.log("Configured session not found"); return; }
        if (!execution.lead_id) { console.log("No lead_id"); return; }
        const { data: lead } = await supabase
          .from("leads").select("phone, name").eq("id", execution.lead_id).single();
        if (!lead?.phone) { console.log("Lead has no phone"); return; }
        if (!isValidBrazilianWhatsAppNumber(lead.phone)) {
          throw new Error(`Telefone WhatsApp invalido para o lead: ${lead.phone}`);
        }

        const messageContent = await replaceVariables(
          supabase,
          (config.message as string) || (config.template_content as string) || "",
          execution,
          { contact_name: lead.name, contact_phone: lead.phone },
        );

        const sendResult = await sendWhatsAppTextProviderAware(
          supabaseUrl,
          serviceRoleKey,
          evolutionApiUrl,
          evolutionApiKey,
          session,
          normalizePhoneNumber(lead.phone),
          messageContent,
        );
        const sentMessageId = getSentMessageId(sendResult) || crypto.randomUUID();
        console.log("✉️ WhatsApp sent (configured session), id:", sentMessageId);

        await persistOutgoingMessage(supabase, {
          sessionId: configuredSessionId,
          organizationId: execution.organization_id,
          phone: normalizePhoneNumber(lead.phone),
          contactName: lead.name,
          leadId: execution.lead_id,
          messageContent, sentMessageId, mediaType: "text",
        });

        await logAutomationActivity(supabase, execution.lead_id, "automation_message",
          messageContent.substring(0, 200) + (messageContent.length > 200 ? "..." : ""),
          { channel: "whatsapp", automation_action: "send_whatsapp", session_id: configuredSessionId });
        return;
      }

      // Fallback: use conversation_id
      if (!execution.conversation_id) { console.log("No conversation_id or session_id"); return; }
      const { data: conv } = await supabase
        .from("whatsapp_conversations")
        .select("*, session:whatsapp_sessions(*)")
        .eq("id", execution.conversation_id).single();
      if (!conv?.session) { console.log("Conversation/session not found"); return; }
      if (!isValidBrazilianWhatsAppNumber(conv.contact_phone)) {
        throw new Error(`Telefone WhatsApp invalido para a conversa: ${conv.contact_phone || "vazio"}`);
      }

      const messageContent = await replaceVariables(
        supabase,
        (config.message as string) || (config.template_content as string) || "",
        execution, conv,
      );
      const sendResult = await sendWhatsAppTextProviderAware(
        supabaseUrl,
        serviceRoleKey,
        evolutionApiUrl,
        evolutionApiKey,
        conv.session,
        normalizePhoneNumber(conv.contact_phone),
        messageContent,
      );
      const sentMsgId = getSentMessageId(sendResult) || crypto.randomUUID();
      await supabase.from("whatsapp_messages").upsert({
        conversation_id: execution.conversation_id,
        session_id: conv.session_id,
        organization_id: conv.organization_id,
        lead_id: conv.lead_id || execution.lead_id || null,
        message_id: sentMsgId,
        from_me: true,
        content: messageContent,
        message_type: "text",
        status: "sent",
        sent_at: new Date().toISOString(),
        sender_name: "Automação",
      }, { onConflict: "session_id,message_id" });
      await supabase.from("whatsapp_conversations").update({
        last_message: messageContent,
        last_message_at: new Date().toISOString(),
      }).eq("id", execution.conversation_id);
      await logAutomationActivity(supabase, execution.lead_id, "automation_message",
        messageContent.substring(0, 200), { channel: "whatsapp", conversation_id: execution.conversation_id });
      return;
    }

    case "move_stage":
    case "move_lead": {
      if (!execution.lead_id) return;
      const targetStageId = config.stage_id || config.target_stage_id;
      if (!targetStageId) return;
      await supabase.from("leads").update({
        stage_id: targetStageId, stage_entered_at: new Date().toISOString(),
      }).eq("id", execution.lead_id);
      return;
    }

    case "add_tag": {
      if (!execution.lead_id) return;
      const tagId = config.tag_id;
      if (!tagId) return;
      const { data: existing } = await supabase
        .from("lead_tags").select("id").eq("lead_id", execution.lead_id).eq("tag_id", tagId).maybeSingle();
      if (!existing) {
        await supabase.from("lead_tags").insert({ lead_id: execution.lead_id, tag_id: tagId });
      }
      return;
    }

    case "create_construction_project": {
      if (!execution.lead_id) return;
      const { data: lead } = await supabase.from("leads").select("*").eq("id", execution.lead_id).single();
      if (!lead) return;

      const { data: project, error: projErr } = await supabase.from("construction_projects").insert({
        organization_id: execution.organization_id,
        name: `Obra - ${lead.name}`,
        status: 'waiting',
        property_id: lead.property_id,
        budget_estimated: lead.valor_interesse || 0,
        start_date_planned: new Date().toISOString().split('T')[0]
      }).select().single();

      if (projErr) throw projErr;

      // Adicionar atividade
      await logAutomationActivity(supabase, execution.lead_id, "project_created", 
        `Obra "${project.name}" criada automaticamente após contrato.`, 
        { project_id: project.id });

      // Criar milestones padrão (Plenos Obras)
      const milestones = [
        { name: 'Limpeza do Terreno', order_index: 0 },
        { name: 'Fundação', order_index: 1 },
        { name: 'Alvenaria', order_index: 2 },
        { name: 'Cobertura', order_index: 3 },
        { name: 'Acabamento', order_index: 4 },
        { name: 'Entrega', order_index: 5 }
      ];

      await supabase.from("construction_milestones").insert(
        milestones.map(m => ({
          project_id: project.id,
          organization_id: execution.organization_id,
          name: m.name,
          order_index: m.order_index,
          status: 'pending'
        }))
      );

      // Criar requests automáticos
      const departments = ['architecture', 'engineering', 'purchase'];
      for (const dept of departments) {
        await supabase.from("operational_requests").insert({
          organization_id: execution.organization_id,
          project_id: project.id,
          lead_id: lead.id,
          type: dept,
          status: 'pending',
          priority: 'high',
          title: `Setup Inicial - ${dept.toUpperCase()}`,
          description: `Configuração inicial do departamento para a nova obra ${project.name}`
        });
      }

      return;
    }

    case "remove_tag": {
      if (!execution.lead_id) return;
      const removeTagId = config.tag_id;
      if (!removeTagId) return;
      await supabase.from("lead_tags").delete()
        .eq("lead_id", execution.lead_id).eq("tag_id", removeTagId);
      return;
    }

    case "assign_user": {
      if (!execution.lead_id) return;
      const assignUserId = config.user_id || config.assigned_user_id;
      if (!assignUserId) return;
      await supabase.from("leads").update({ assigned_user_id: assignUserId }).eq("id", execution.lead_id);
      return;
    }

    case "create_task": {
      if (!execution.lead_id) return;
      await supabase.from("lead_tasks").insert({
        lead_id: execution.lead_id,
        title: (config.task_title as string) || "Tarefa automática",
        description: (config.task_description as string) || null,
        type: (config.task_type as string) || "task",
        due_date: config.due_days
          ? new Date(Date.now() + (config.due_days as number) * 86_400_000).toISOString() : null,
      });
      return;
    }

    case "send_notification": {
      const notifyUserId = config.notify_user_id || config.user_id;
      if (!notifyUserId) return;
      await supabase.from("notifications").insert({
        user_id: notifyUserId,
        organization_id: execution.organization_id,
        title: (config.notification_title as string) || "Notificação de automação",
        content: (config.notification_content as string) || null,
        type: "automation",
        lead_id: execution.lead_id || null,
      });
      return;
    }

    case "send_audio":
    case "send_image":
    case "send_video": {
      const claimed = await claimDispatch(supabase, execution.id, node.id, execution.organization_id);
      if (!claimed) {
        console.log(`🛑 Skipping ${actionType} — already dispatched for node ${node.id}`);
        return;
      }
      const mediaType = actionType.replace("send_", "") as "audio" | "image" | "video";
      await sendMediaMessage(
        supabase,
        execution,
        config,
        mediaType,
        supabaseUrl,
        serviceRoleKey,
        evolutionApiUrl,
        evolutionApiKey,
      );
      return;
    }

    case "set_variable": {
      const subAction = config.actionType as string;
      if (subAction === "deal_status") {
        if (!execution.lead_id) return;
        const newStatus = config.deal_status as string;
        if (!["open", "won", "lost"].includes(newStatus)) return;
        const update: Record<string, unknown> = { deal_status: newStatus };
        if (newStatus === "won") { update.won_at = new Date().toISOString(); update.lost_at = null; update.lost_reason = null; }
        else if (newStatus === "lost") { update.lost_at = new Date().toISOString(); update.won_at = null; }
        else { update.won_at = null; update.lost_at = null; update.lost_reason = null; }
        await supabase.from("leads").update(update).eq("id", execution.lead_id);
        await logAutomationActivity(supabase, execution.lead_id, "status_change",
          `Status alterado para "${newStatus}" via automação`, { new_status: newStatus });
      } else if (subAction === "property_interest") {
        if (!execution.lead_id) return;
        const propertyId = config.property_id as string;
        if (!propertyId) return;
        await supabase.from("leads").update({ property_id: propertyId }).eq("id", execution.lead_id);
        await logAutomationActivity(supabase, execution.lead_id, "property_linked",
          "Imóvel de interesse vinculado via automação", { property_id: propertyId });
      }
      return;
    }

    case "track_gamification_event": {
      const eventType = config.event_type as string;
      const points = Number(config.points || 0);
      if (!eventType) return;

      // Log the event
      await supabase.from("gamification_events").insert({
        organization_id: execution.organization_id,
        user_id: config.user_id || (execution.lead_id ? (await supabase.from("leads").select("assigned_user_id").eq("id", execution.lead_id).single()).data?.assigned_user_id : null),
        event_type: eventType,
        source_module: config.source_module || "automation",
        source_id: execution.lead_id || execution.id,
        metadata: { ...config.metadata, automation_id: execution.automation_id },
        points_earned: points,
      });

      // Update user stats
      if (execution.lead_id) {
        const { data: lead } = await supabase.from("leads").select("assigned_user_id").eq("id", execution.lead_id).single();
        if (lead?.assigned_user_id) {
          await supabase.rpc("increment_user_points", {
            p_user_id: lead.assigned_user_id,
            p_points: points,
            p_organization_id: execution.organization_id
          });
        }
      }
      return;
    }

    default:
      console.log(`Unknown action type: ${actionType}`);
  }
}


// deno-lint-ignore no-explicit-any
async function persistOutgoingMessage(supabase: any, p: {
  sessionId: string; organizationId: string; phone: string; contactName?: string; leadId?: string;
  messageContent: string; sentMessageId: string; mediaType: "text" | "audio" | "image" | "video";
}) {
  const remoteJid = `${p.phone}@s.whatsapp.net`;
  let { data: convForMsg } = await supabase
    .from("whatsapp_conversations")
    .select("id")
    .eq("session_id", p.sessionId)
    .eq("organization_id", p.organizationId)
    .eq("contact_phone", p.phone)
    .is("deleted_at", null)
    .maybeSingle();

  if (!convForMsg && p.leadId) {
    const { data: convByLead } = await supabase
      .from("whatsapp_conversations").select("id")
      .eq("organization_id", p.organizationId)
      .eq("lead_id", p.leadId).is("deleted_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1).maybeSingle();
    convForMsg = convByLead;
  }

  if (!convForMsg) {
    const { data: newConv } = await supabase.from("whatsapp_conversations").insert({
      session_id: p.sessionId,
      organization_id: p.organizationId,
      remote_jid: remoteJid,
      contact_phone: p.phone,
      contact_name: p.contactName || p.phone,
      lead_id: p.leadId,
      is_group: false,
      last_message: p.messageContent,
      last_message_at: new Date().toISOString(),
      unread_count: 0,
    }).select("id").single();
    convForMsg = newConv;
  }

  if (convForMsg) {
    await supabase.from("whatsapp_messages").upsert({
      conversation_id: convForMsg.id,
      session_id: p.sessionId,
      organization_id: p.organizationId,
      lead_id: p.leadId || null,
      message_id: p.sentMessageId,
      from_me: true,
      content: p.messageContent,
      message_type: p.mediaType,
      status: "sent",
      sent_at: new Date().toISOString(),
      sender_name: "Automação",
    }, { onConflict: "session_id,message_id" });
    await supabase.from("whatsapp_conversations").update({
      last_message: p.messageContent,
      last_message_at: new Date().toISOString(),
      lead_id: p.leadId,
    }).eq("id", convForMsg.id);
  }
}

// deno-lint-ignore no-explicit-any
async function sendMediaMessage(
  supabase: any,
  execution: { lead_id?: string; conversation_id?: string; organization_id: string },
  config: Record<string, unknown>,
  mediaType: "audio" | "image" | "video",
  supabaseUrl: string,
  serviceRoleKey: string,
  evolutionApiUrl?: string,
  evolutionApiKey?: string,
) {
  const sessionId = config.session_id as string;
  if (!sessionId || !execution.lead_id) return;
  const { data: session } = await supabase.from("whatsapp_sessions").select("*").eq("id", sessionId).single();
  if (!session) return;
  const { data: lead } = await supabase.from("leads").select("phone, name").eq("id", execution.lead_id).single();
  if (!lead?.phone) return;
  const number = normalizePhoneNumber(lead.phone);

  let endpoint = "";
  let body: Record<string, unknown> = { number };
  let messageContent = "";
  if (mediaType === "audio") {
    const audioUrl = config.audio_url as string;
    if (!audioUrl) return;
    endpoint = `message/sendWhatsAppAudio/${session.instance_name}`;
    body = { number, audio: audioUrl };
    messageContent = "🎤 Áudio";
  } else if (mediaType === "image") {
    const imageUrl = config.image_url as string;
    const caption = (config.caption as string) || "";
    if (!imageUrl) return;
    endpoint = `message/sendMedia/${session.instance_name}`;
    body = { number, media: imageUrl, mediatype: "image", caption };
    messageContent = caption || "📷 Imagem";
  } else {
    const videoUrl = config.video_url as string;
    if (!videoUrl) return;
    endpoint = `message/sendMedia/${session.instance_name}`;
    body = { number, media: videoUrl, mediatype: "video", caption: "" };
    messageContent = "🎥 Vídeo";
  }

  if (session.provider === "evolution_go") {
    const goBody = mediaType === "audio"
      ? { number, media: config.audio_url as string, mimetype: "audio/ogg" }
      : body;
    const result = await sendEvolutionGoAction(
      supabaseUrl,
      serviceRoleKey,
      sessionId,
      mediaType === "audio" ? "send.audio" : "send.media",
      goBody,
    );
    const sentMsgId = getSentMessageId(result) || crypto.randomUUID();
    await persistOutgoingMessage(supabase, {
      sessionId, organizationId: execution.organization_id, phone: number, contactName: lead.name, leadId: execution.lead_id,
      messageContent, sentMessageId: sentMsgId, mediaType,
    });
    await logAutomationActivity(supabase, execution.lead_id, "automation_message", messageContent,
      { channel: "whatsapp", automation_action: `send_${mediaType}`, session_id: sessionId });
    return;
  }

  if (!evolutionApiUrl || !evolutionApiKey) {
    throw new Error("Evolution API not configured");
  }

  let response;
  let result;
  let lastError;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxAttempts} to send ${mediaType} to ${number}...`);
      response = await fetch(`${evolutionApiUrl}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evolutionApiKey },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        result = await response.json();
        break;
      }

      const errText = await response.text();
      console.warn(`Attempt ${attempt} failed: ${errText}`);
      
      if (attempt < maxAttempts && (response.status >= 500 || errText.includes("timeout") || errText.includes("Connection Closed"))) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        continue;
      }
      throw new Error(`Failed to send ${mediaType}: ${errText}`);
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) break;
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("desconectada") || errMsg.includes("invalid")) break;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }

  if (!result) {
    throw lastError || new Error(`Failed to send ${mediaType} after ${maxAttempts} attempts`);
  }
  const sentMsgId = getSentMessageId(result) || crypto.randomUUID();
  await persistOutgoingMessage(supabase, {
    sessionId, organizationId: execution.organization_id, phone: number, contactName: lead.name, leadId: execution.lead_id,
    messageContent, sentMessageId: sentMsgId, mediaType,
  });
  await logAutomationActivity(supabase, execution.lead_id, "automation_message", messageContent,
    { channel: "whatsapp", automation_action: `send_${mediaType}`, session_id: sessionId });
}

// ────────────────────────────────────────────────────────────────────────────
// CONDITION EVALUATION (unchanged from v1)
// ────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function evaluateCondition(
  supabase: any,
  config: Record<string, unknown>,
  execution: { lead_id?: string; conversation_id?: string },
): Promise<boolean> {
  const conditionType = config.condition_type || config.type;
  switch (conditionType) {
    case "has_lead": return !!execution.lead_id;
    case "has_conversation": return !!execution.conversation_id;
    case "always_true": return true;
    case "always_false": return false;

    case "response_sentiment": {
      if (!execution.lead_id) return false;
      const { data: conversations } = await supabase
        .from("whatsapp_conversations").select("id")
        .eq("lead_id", execution.lead_id).is("deleted_at", null);
      if (!conversations?.length) return false;
      const convIds = conversations.map((c: { id: string }) => c.id);
      const { data: lastMsg } = await supabase
        .from("whatsapp_messages").select("content")
        .in("conversation_id", convIds).eq("from_me", false)
        .order("sent_at", { ascending: false }).limit(1).maybeSingle();
      if (!lastMsg?.content) return false;
      const messageText = lastMsg.content.trim().toLowerCase();
      const defaultPositive = "sim, claro, quero, pode, beleza, bora, vamos, aceito, ok, com certeza, fechado, top, pode ser, show, perfeito, ótimo, massa, interessado";
      const defaultNegative = "não, nao, nope, sem interesse, desculpa, obrigado mas não, talvez não, deixa pra lá, não quero, não preciso, dispenso, valeu mas não, nunca, jamais, negativo";
      const positive = ((config.positive_keywords as string) || defaultPositive)
        .split(",").map((k: string) => k.trim().toLowerCase()).filter(Boolean);
      const negative = ((config.negative_keywords as string) || defaultNegative)
        .split(",").map((k: string) => k.trim().toLowerCase()).filter(Boolean);
      const sortedPos = [...positive].sort((a, b) => b.length - a.length);
      const sortedNeg = [...negative].sort((a, b) => b.length - a.length);
      const bestPos = sortedPos.find((kw: string) => messageText.includes(kw)) || null;
      const bestNeg = sortedNeg.find((kw: string) => messageText.includes(kw)) || null;
      const wordCount = messageText.split(/\s+/).length;
      if (bestNeg && !bestPos) return false;
      if (bestPos && !bestNeg) return true;
      if (bestPos && bestNeg) {
        if (bestNeg.length > bestPos.length) return false;
        if (bestPos.length > bestNeg.length) return true;
        return wordCount > 3;
      }
      return false;
    }

    case "custom": {
      if (!execution.lead_id) return false;
      const variable = (config.variable as string) || "";
      const operator = (config.operator as string) || "equals";
      const expected = (config.value as string) || "";
      const { data: leadData } = await supabase
        .from("leads").select("*").eq("id", execution.lead_id).single();
      if (!leadData) return false;
      const varKey = variable.replace(/^lead\./, "").trim();
      const actual = String(leadData[varKey] ?? "");
      switch (operator) {
        case "equals": return actual.toLowerCase() === expected.toLowerCase();
        case "not_equals": return actual.toLowerCase() !== expected.toLowerCase();
        case "contains": return actual.toLowerCase().includes(expected.toLowerCase());
        case "not_contains": return !actual.toLowerCase().includes(expected.toLowerCase());
        case "greater_than": return Number(actual) > Number(expected);
        case "less_than": return Number(actual) < Number(expected);
        case "is_set": return actual !== "" && actual !== "null" && actual !== "undefined";
        case "is_not_set": return actual === "" || actual === "null" || actual === "undefined";
        default: return true;
      }
    }

    default:
      return true;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// VARIABLE REPLACEMENT (unchanged from v1)
// ────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function replaceVariables(
  supabase: any,
  template: string,
  execution: { lead_id?: string; conversation_id?: string; organization_id: string },
  conversation?: { contact_name?: string; contact_phone?: string },
): Promise<string> {
  let result = template;
  result = result.replace(/\{\{date\}\}/g, new Date().toLocaleDateString("pt-BR"));
  result = result.replace(/\{\{time\}\}/g, new Date().toLocaleTimeString("pt-BR"));
  if (conversation) {
    result = result.replace(/\{\{contact_name\}\}/g, conversation.contact_name || "");
    result = result.replace(/\{\{contact_phone\}\}/g, conversation.contact_phone || "");
  }
  if (execution.lead_id) {
    const { data: lead } = await supabase
      .from("leads").select("*")
      .eq("id", execution.lead_id).single();
    if (lead) {
      result = result.replace(/\{\{lead\.name\}\}/g, lead.name || "");
      result = result.replace(/\{\{lead\.phone\}\}/g, lead.phone || "");
      result = result.replace(/\{\{lead\.email\}\}/g, lead.email || "");
      result = result.replace(/\{\{lead\.source\}\}/g, lead.source || "");
      result = result.replace(/\{\{lead\.message\}\}/g, lead.message || "");
      result = result.replace(/\{\{lead\.valor_interesse\}\}/g,
        lead.valor_interesse ? `R$ ${Number(lead.valor_interesse).toLocaleString("pt-BR")}` : "");
    }
    const { data: customer } = await supabase
      .from("telecom_customers").select("*").eq("lead_id", execution.lead_id).maybeSingle();
    if (customer) {
      result = result.replace(/\{\{customer\.address\}\}/g, customer.address || "");
      result = result.replace(/\{\{customer\.city\}\}/g, customer.city || "");
      result = result.replace(/\{\{customer\.neighborhood\}\}/g, customer.neighborhood || "");
      result = result.replace(/\{\{customer\.cep\}\}/g, customer.cep || "");
      result = result.replace(/\{\{customer\.cpf_cnpj\}\}/g, customer.cpf_cnpj || "");
      result = result.replace(/\{\{customer\.contracted_plan\}\}/g, customer.contracted_plan || "");
      result = result.replace(/\{\{customer\.plan_value\}\}/g,
        customer.plan_value ? `R$ ${Number(customer.plan_value).toLocaleString("pt-BR")}` : "");
      result = result.replace(/\{\{customer\.reference_point\}\}/g, customer.reference_point || "");
    }
  }
  return result;
}
