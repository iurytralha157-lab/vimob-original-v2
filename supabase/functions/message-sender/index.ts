import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type WhatsAppProvider = "evolution" | "evolution_go";

function getSentMessageId(data: any) {
  const paths = [
    "sentMessageId",
    "messageId",
    "messageID",
    "MessageID",
    "id",
    "ID",
    "Id",
    "key.id",
    "key.ID",
    "Key.ID",
    "data.sentMessageId",
    "data.messageId",
    "data.messageID",
    "data.MessageID",
    "data.id",
    "data.ID",
    "data.key.id",
    "data.Key.ID",
    "Data.messageId",
    "Data.MessageID",
    "Data.id",
    "Data.ID",
    "message.key.id",
    "message.Key.ID",
    "data.message.key.id",
    "data.message.Key.ID",
    "response.key.id",
    "response.Key.ID",
  ];
  for (const path of paths) {
    const value = path.split(".").reduce((acc, key) => acc?.[key], data);
    if (value) return String(value);
  }
  return null;
}

function isAutomationOutboxMessage(message: any) {
  const clientMessageId = String(message?.client_message_id || "");
  return !message?.created_by || clientMessageId.startsWith("jhenny-") || clientMessageId.startsWith("ai-");
}

function getOutboxSenderName(message: any) {
  const clientMessageId = String(message?.client_message_id || "");
  if (clientMessageId.startsWith("jhenny-") || clientMessageId.startsWith("ai-")) return "Jhenny";
  return null;
}

async function sendViaEvolutionGo(
  supabaseUrl: string,
  serviceRoleKey: string,
  sessionId: string,
  isMedia: boolean,
  body: Record<string, unknown>,
  mediaType?: string,
) {
  const action = isMedia
    ? mediaType === "audio" ? "send.audio" : "send.media"
    : "send.text";

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

async function sendViaEvolutionLegacy(
  evolutionApiUrl: string | undefined,
  evolutionApiKey: string | undefined,
  instanceName: string,
  isMedia: boolean,
  body: Record<string, unknown>,
) {
  if (!evolutionApiUrl || !evolutionApiKey) {
    throw new Error("Evolution API not configured");
  }

  const endpoint = isMedia
    ? `${evolutionApiUrl}/message/sendMedia/${instanceName}`
    : `${evolutionApiUrl}/message/sendText/${instanceName}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "apikey": evolutionApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || data.message || "Failed to send message");
  }

  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch pending messages from outbox
    // - status = 'pending'
    // - attempts < max_attempts
    // - Order by created_at (FIFO)
    // - Limit to 10 per execution
    const { data: pendingMessages, error: fetchError } = await supabase
      .from("outbox_messages")
      .select(`
        *,
        session:whatsapp_sessions!outbox_messages_session_id_fkey(id, instance_name, status, provider),
        conversation:whatsapp_conversations!outbox_messages_conversation_id_fkey(id, remote_jid, is_group)
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10);

    if (fetchError) {
      console.error("Error fetching pending messages:", fetchError);
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${pendingMessages?.length || 0} pending messages`);

    const results = [];

    for (const message of pendingMessages || []) {
      try {
        // Mark as processing
        await supabase
          .from("outbox_messages")
          .update({ status: "processing", attempts: message.attempts + 1 })
          .eq("id", message.id);

        // Check session is connected
        if (message.session?.status !== "connected") {
          throw new Error("Session not connected");
        }

        // Use full JID for groups, digits-only for personal
        const isGroup = message.conversation?.is_group || message.conversation?.remote_jid?.endsWith("@g.us");
        const phone = isGroup 
          ? message.conversation?.remote_jid 
          : message.conversation?.remote_jid
              ?.replace("@s.whatsapp.net", "")
              .replace("@c.us", "");

        if (!phone) {
          throw new Error("Invalid conversation remote_jid");
        }

        const provider = (message.session?.provider || "evolution") as WhatsAppProvider;
        const isMedia = message.message_type !== "text" && (message.media_url || message.media_base64);

        // Build request body
        let body: any;
        if (isMedia) {
          // Não enviar caption se for apenas o nome do arquivo (evita exibir nome no WhatsApp)
          const shouldSendCaption = message.content && 
            message.content !== message.media_filename && 
            !message.content.match(/^[a-f0-9-]+\.(png|jpg|jpeg|gif|webp|mp4|mp3|pdf|doc|docx)$/i);
          
          body = {
            number: phone,
            mediatype: message.message_type || "image",
            caption: shouldSendCaption ? message.content : undefined,
            media: message.media_url || message.media_base64,
            fileName: message.media_filename,
            mimetype: message.media_mime_type || undefined,
          };
          if (message.media_base64) {
            body.media = message.media_base64;
          }
        } else {
          body = {
            number: phone,
            text: message.content,
          };
        }

        const data = provider === "evolution_go"
          ? await sendViaEvolutionGo(
              SUPABASE_URL,
              SUPABASE_SERVICE_ROLE_KEY,
              message.session_id,
              !!isMedia,
              body,
              message.message_type,
            )
          : await sendViaEvolutionLegacy(
              EVOLUTION_API_URL,
              EVOLUTION_API_KEY,
              message.session.instance_name,
              !!isMedia,
              body,
            );
        console.log(`Send result for ${message.id} via ${provider}:`, data);

        // Mark as sent
        const sentMessageId = getSentMessageId(data) || crypto.randomUUID();
        await supabase
          .from("outbox_messages")
          .update({ 
            status: "sent",
            sent_message_id: sentMessageId,
            processed_at: new Date().toISOString()
          })
          .eq("id", message.id);

        // ===== OPTIMISTIC UPDATE: Update existing message by client_message_id =====
        const outboxSenderName = getOutboxSenderName(message);
        if (message.client_message_id) {
          // Try to update the optimistic message first
          const { data: existingMsg } = await supabase
            .from("whatsapp_messages")
            .select("id")
            .eq("client_message_id", message.client_message_id)
            .maybeSingle();

          if (existingMsg) {
            // Update existing optimistic message
            await supabase
              .from("whatsapp_messages")
              .update({
                message_id: sentMessageId || message.client_message_id,
                status: "sent",
                sent_at: new Date().toISOString(),
              })
              .eq("id", existingMsg.id);
            
            console.log(`Updated optimistic message ${existingMsg.id} with sent status`);
          } else {
            // No optimistic message found, insert new one
            await supabase.from("whatsapp_messages").insert({
              conversation_id: message.conversation_id,
              session_id: message.session_id,
              message_id: sentMessageId || crypto.randomUUID(),
              client_message_id: message.client_message_id,
              from_me: true,
              content: message.content,
              message_type: message.message_type,
              media_url: message.media_url,
              media_mime_type: message.media_mime_type,
              status: "sent",
              sent_at: new Date().toISOString(),
              sender_name: outboxSenderName,
            });
          }
        } else {
          // Legacy: no client_message_id, just insert
          await supabase.from("whatsapp_messages").insert({
            conversation_id: message.conversation_id,
            session_id: message.session_id,
            message_id: sentMessageId || crypto.randomUUID(),
            from_me: true,
            content: message.content,
            message_type: message.message_type,
            media_url: message.media_url,
            media_mime_type: message.media_mime_type,
            status: "sent",
            sent_at: new Date().toISOString(),
            sender_name: outboxSenderName,
          });
        }

        // Update conversation
        await supabase
          .from("whatsapp_conversations")
          .update({
            last_message: message.content,
            last_message_at: new Date().toISOString(),
            unread_count: 0,
          })
          .eq("id", message.conversation_id);

        // ===== FIRST RESPONSE & FIRST TOUCH TRACKING =====
        // Get the conversation to check if it has a lead_id
        const { data: convData } = await supabase
          .from("whatsapp_conversations")
          .select("lead_id")
          .eq("id", message.conversation_id)
          .single();

        if (convData?.lead_id) {
          try {
            console.log(`Triggering first response calculation for lead ${convData.lead_id}`);
            
            // Mark first_touch_at for pool system (only if not already set)
            await supabase
              .from("leads")
              .update({ first_touch_at: new Date().toISOString() })
              .eq("id", convData.lead_id)
              .is("first_touch_at", null);
            
            console.log(`Marked first touch for lead ${convData.lead_id}`);
            
            // Call calculate-first-response for SLA tracking
            await fetch(`${SUPABASE_URL}/functions/v1/calculate-first-response`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
              },
              body: JSON.stringify({
                lead_id: convData.lead_id,
                channel: "whatsapp",
                actor_user_id: message.created_by,
                is_automation: isAutomationOutboxMessage(message),
                organization_id: message.organization_id
              })
            });
          } catch (firstResponseError) {
            console.error("Error calling first response:", firstResponseError);
            // Don't fail the message send if first response fails
          }

          // ===== STOP AUTOMATIONS ON MANUAL HUMAN REPLY (via internal CRM chat) =====
          // Mirror of evolution-webhook's isManualInteraction path. We cancel all
          // running/waiting executions for this lead so the automation stops the
          // moment the broker takes over the conversation from the app UI.
          if (message.created_by) {
            try {
            const { data: activeExecs } = await supabase
              .from("automation_executions")
              .select("id, automation_id, automations(name)")
              .eq("lead_id", convData.lead_id)
              .in("status", ["running", "waiting"]);

            if (activeExecs && activeExecs.length > 0) {
              const ids = activeExecs.map((e: any) => e.id);
              await supabase
                .from("automation_executions")
                .update({
                  status: "cancelled",
                  completed_at: new Date().toISOString(),
                  error_message: "Cancelado: intervenção humana (chat interno)",
                })
                .in("id", ids);

              const activityRows = activeExecs.map((e: any) => ({
                lead_id: convData.lead_id,
                type: "automation_cancelled_manual",
                content: `Automação "${e.automations?.name || ""}" cancelada: atendimento humano iniciado`,
                metadata: { is_automation: true, execution_id: e.id, automation_id: e.automation_id, source: "internal_chat" },
                user_id: null,
              }));
              if (activityRows.length) {
                await supabase.from("activities").insert(activityRows);
              }
              console.log(`Cancelled ${ids.length} active automation(s) due to manual reply via internal chat`);
            }
            } catch (cancelErr) {
              console.error("Error cancelling automations on manual reply:", cancelErr);
            }
          }
        }

        results.push({
          message_id: message.id,
          status: "sent",
          sent_message_id: sentMessageId
        });

      } catch (error) {
        console.error(`Error sending message ${message.id}:`, error);
        
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const isFinalAttempt = message.attempts + 1 >= message.max_attempts;

        await supabase
          .from("outbox_messages")
          .update({
            status: isFinalAttempt ? "failed" : "pending",
            error_message: errorMessage,
            processed_at: isFinalAttempt ? new Date().toISOString() : null
          })
          .eq("id", message.id);

        // If final attempt failed, update the optimistic message status too
        if (isFinalAttempt && message.client_message_id) {
          await supabase
            .from("whatsapp_messages")
            .update({ status: "failed" })
            .eq("client_message_id", message.client_message_id);
        }

        results.push({
          message_id: message.id,
          status: isFinalAttempt ? "failed" : "retry",
          error: errorMessage,
          attempt: message.attempts + 1
        });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: results.length,
        results 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Message sender error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
