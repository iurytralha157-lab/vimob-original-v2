import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TriggerPayload {
  event_type: string;
  // organization_id NÃO deve vir do payload - buscar do servidor
  data: {
    lead_id?: string;
    conversation_id?: string;
    session_id?: string;
    message?: string;
    old_stage_id?: string;
    new_stage_id?: string;
    tag_id?: string;
    [key: string]: unknown;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const payload: TriggerPayload = await req.json();
    console.log("Automation trigger received:", JSON.stringify(payload, null, 2));

    const { event_type, data } = payload;

    if (!event_type) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing event_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========= SEGURANÇA: Buscar organization_id do servidor =========
    let organizationId: string | null = null;
    
    // Se tiver lead_id, buscar org do lead
    if (data.lead_id) {
      const { data: lead, error: leadError } = await supabaseAdmin
        .from("leads")
        .select("organization_id")
        .eq("id", data.lead_id)
        .single();
      
      if (!leadError && lead) {
        organizationId = lead.organization_id;
      }
    }
    
    // Se tiver conversation_id, buscar org da conversa
    if (!organizationId && data.conversation_id) {
      const { data: conversation, error: convError } = await supabaseAdmin
        .from("whatsapp_conversations")
        .select("organization_id")
        .eq("id", data.conversation_id)
        .single();
      
      if (!convError && conversation) {
        organizationId = conversation.organization_id;
      }
    }
    
    // Se tiver session_id, buscar org da sessão
    if (!organizationId && data.session_id) {
      const { data: session, error: sessError } = await supabaseAdmin
        .from("whatsapp_sessions")
        .select("organization_id")
        .eq("id", data.session_id)
        .single();
      
      if (!sessError && session) {
        organizationId = session.organization_id;
      }
    }

    if (!organizationId) {
      console.error("Could not determine organization_id from data");
      return new Response(
        JSON.stringify({ success: false, error: "Could not determine organization from data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Resolved organization_id: ${organizationId}`);

    // ========= NOVO: Acordar automações em espera =========
    if (event_type === "message_received" && data.lead_id) {
      console.log(`Checking for waiting executions to wake up for lead ${data.lead_id}`);
      const { data: waitingExecutions } = await supabaseAdmin
        .from("automation_executions")
        .select(`
          *,
          automation:automations(
            *,
            nodes:automation_nodes(*),
            connections:automation_connections(*)
          )
        `)
        .eq("lead_id", data.lead_id)
        .eq("status", "waiting")
        .order("started_at", { ascending: false });

      if (waitingExecutions && waitingExecutions.length > 0) {
        console.log(`Found ${waitingExecutions.length} waiting execution(s) to check`);
        for (const exec of waitingExecutions) {
          // O nó atual da execução é o que ela vai processar ao acordar.
          // Mas precisamos olhar as regras do nó ANTERIOR (o nó de Delay/Wait)
          // que colocou ela em espera.
          const automation = exec.automation;
          const connToCurrent = automation.connections?.find((c: any) => c.target_node_id === exec.current_node_id);
          const previousNode = automation.nodes?.find((n: any) => n.id === connToCurrent?.source_node_id);

          if (previousNode && (previousNode.node_type === "delay" || previousNode.node_type === "wait")) {
            console.log(`Waking up execution ${exec.id} via node ${previousNode.id}`);
            
            // Legacy auto-reply and stage move logic removed to ensure only explicit flow bubbles are executed.

            // 3. Se houver uma conexão específica para "Respondido", seguir por ela
            const replyConn = automation.connections?.find(
              (c: any) => c.source_node_id === previousNode.id && 
              (c.source_handle === "replied" || c.source_handle === "reply" || c.source_handle === "respondido" || c.condition_branch === "replied")
            );

            if (replyConn) {
              console.log(`Following 'replied' branch to node ${replyConn.target_node_id}`);
              await supabaseAdmin.from("automation_executions").update({
                current_node_id: replyConn.target_node_id,
                status: "running",
                next_execution_at: null
              }).eq("id", exec.id);
            } else {
              // CRM default: a customer reply stops pending follow-up automations.
              // Continuing a no-reply path after the lead answered can send duplicate messages.
              console.log(`Stopping execution ${exec.id} because lead replied and no replied branch exists`);
              await supabaseAdmin.from("automation_executions").update({
                status: "cancelled",
                completed_at: new Date().toISOString(),
                next_execution_at: null,
                error_message: "Cancelado: lead respondeu",
              }).eq("id", exec.id);
              continue;
            }

            // Trigger executor para continuar
            await fetch(`${SUPABASE_URL}/functions/v1/automation-executor`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({ execution_id: exec.id }),
            });
          }
        }
      }
    }

    // Map event types to trigger types (mapeamento de eventos para tipos de trigger)
    // O frontend usa 'lead_stage_changed' mas o banco salva como 'lead_stage_changed'
    const triggerTypeMap: Record<string, string[]> = {
      message_received: ["message_received"],
      lead_stage_changed: ["lead_stage_changed", "stage_change"], // aceita ambos os formatos
      lead_created: ["lead_created"],
      tag_added: ["tag_added"],
      tag_removed: ["tag_removed"],
    };

    const triggerTypes = triggerTypeMap[event_type];
    if (!triggerTypes) {
      console.log(`Unknown event type: ${event_type}`);
      return new Response(
        JSON.stringify({ success: true, message: "Unknown event type, skipping" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`Looking for automations with trigger types: ${triggerTypes.join(', ')}`);


    // Find active automations matching this trigger
    const { data: automations, error: automationsError } = await supabaseAdmin
      .from("automations")
      .select(`
        *,
        nodes:automation_nodes(*),
        connections:automation_connections(*)
      `)
      .eq("organization_id", organizationId)
      .in("trigger_type", triggerTypes)
      .eq("is_active", true);

    if (automationsError) {
      console.error("Error fetching automations:", automationsError);
      throw automationsError;
    }

    if (!automations || automations.length === 0) {
      console.log(`No active automations found for trigger types: ${triggerTypes.join(', ')}`);
      return new Response(
        JSON.stringify({ success: true, message: "No matching automations" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${automations.length} automation(s) for trigger types: ${triggerTypes.join(', ')}`);

    // Process each matching automation
    for (const automation of automations) {
      try {
        // Check trigger conditions
        const triggerConfig = automation.trigger_config || {};
        
        // Fetch lead data for validation (user/source/meta/campaign filters)
        let leadDataForValidation = null;
        if (data.lead_id && (
          triggerConfig.filter_user_id ||
          triggerConfig.source ||
          triggerConfig.meta_form_id ||
          triggerConfig.campaign_id ||
          triggerConfig.filter_campaign_id ||
          triggerConfig.campaign_name ||
          triggerConfig.filter_campaign_name
        )) {
          const { data: lead } = await supabaseAdmin
            .from("leads")
            .select("assigned_user_id, source, meta_form_id")
            .eq("id", data.lead_id)
            .single();
          const { data: leadMeta } = await supabaseAdmin
            .from("lead_meta")
            .select("campaign_id, campaign_name, utm_campaign")
            .eq("lead_id", data.lead_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          leadDataForValidation = { ...lead, lead_meta: leadMeta };
        }
        
        // Validate conditions based on trigger type
        if (!validateTriggerConditions(
          automation.trigger_type, 
          triggerConfig, 
          {
            ...data,
            source: data.source || leadDataForValidation?.source,
            meta_form_id: data.meta_form_id || leadDataForValidation?.meta_form_id,
            campaign_id: data.campaign_id || leadDataForValidation?.lead_meta?.campaign_id,
            campaign_name: data.campaign_name || leadDataForValidation?.lead_meta?.campaign_name || leadDataForValidation?.lead_meta?.utm_campaign,
          },
          automation.created_by,
          leadDataForValidation?.assigned_user_id
        )) {
          console.log(`Automation ${automation.id} conditions not met, skipping`);
          continue;
        }

        // Find the trigger node (starting point)
        const triggerNode = automation.nodes?.find((n: { node_type: string }) => n.node_type === "trigger");
        if (!triggerNode) {
          console.log(`Automation ${automation.id} has no trigger node, skipping`);
          continue;
        }

        // Find the next node after trigger
        const nextConnection = automation.connections?.find(
          (c: { source_node_id: string }) => c.source_node_id === triggerNode.id
        );
        
        if (!nextConnection) {
          console.log(`Automation ${automation.id} has no connections from trigger, skipping`);
          continue;
        }

        // Fetch lead name for notification
        let leadName = "Lead";
        if (data.lead_id) {
          const { data: leadData } = await supabaseAdmin
            .from("leads")
            .select("name, assigned_user_id")
            .eq("id", data.lead_id)
            .single();
          if (leadData) {
            leadName = leadData.name || "Lead";
          }
        }

        // ===== GUARD: Don't start a new execution if lead already has running/waiting one for this automation =====
        if (data.lead_id) {
          const { data: existingExec } = await supabaseAdmin
            .from("automation_executions")
            .select("id")
            .eq("automation_id", automation.id)
            .eq("lead_id", data.lead_id as string)
            .in("status", ["running", "waiting"])
            .limit(1)
            .maybeSingle();
          
          if (existingExec) {
            console.log(`⚠️ Lead ${data.lead_id} already has active execution ${existingExec.id} for automation ${automation.id}, skipping`);
            continue;
          }
        }

        // Create execution record
        const { data: execution, error: execError } = await supabaseAdmin
          .from("automation_executions")
          .insert({
            automation_id: automation.id,
            organization_id: organizationId,
            lead_id: data.lead_id || null,
            conversation_id: data.conversation_id || null,
            current_node_id: nextConnection.target_node_id,
            status: "running",
            started_at: new Date().toISOString(),
            execution_data: {
              trigger_data: data,
              variables: {},
            },
          })
          .select()
          .single();

        if (execError) {
          console.error(`Error creating execution for automation ${automation.id}:`, execError);
          continue;
        }

        console.log(`Created execution ${execution.id} for automation ${automation.id}`);

        // Send "automation started" notification via Dispatcher
        const notifyUserId = data.lead_id 
          ? (await supabaseAdmin.from("leads").select("assigned_user_id").eq("id", data.lead_id).single()).data?.assigned_user_id 
          : automation.created_by;
        
        if (notifyUserId) {
          await fetch(`${SUPABASE_URL}/functions/v1/notification-dispatcher`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              event_key: "automation_started",
              organization_id: organizationId,
              user_id: notifyUserId,
              lead_id: data.lead_id || null,
              variables: {
                nome_automacao: automation.name,
                nome_lead: leadName
              },
              dedupe_key: `automation_started:${automation.id}:${data.lead_id || notifyUserId}`
            }),
          });
          console.log(`Notification dispatched: automation started for ${leadName}`);
        }

        // Call executor to process the first node
        const executorResponse = await fetch(`${SUPABASE_URL}/functions/v1/automation-executor`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            execution_id: execution.id,
          }),
        });

        if (!executorResponse.ok) {
          const errorText = await executorResponse.text();
          console.error(`Executor failed for execution ${execution.id}:`, errorText);
        }

      } catch (automationError) {
        console.error(`Error processing automation ${automation.id}:`, automationError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: `Processed ${automations.length} automation(s)` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Automation trigger error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function validateTriggerConditions(
  triggerType: string,
  config: Record<string, unknown>,
  data: Record<string, unknown>,
  automationCreatedBy?: string | null,
  leadAssignedUserId?: string | null
): boolean {
  // Validate user filter first (applies to all trigger types)
  if (config.filter_user_id) {
    const filterUserId = config.filter_user_id as string;
    
    if (filterUserId === "__me__") {
      // Compare with automation creator
      if (leadAssignedUserId !== automationCreatedBy) {
        console.log(`User filter (my leads) not matched: lead.assigned_user_id=${leadAssignedUserId}, automation.created_by=${automationCreatedBy}`);
        return false;
      }
    } else if (leadAssignedUserId !== filterUserId) {
      console.log(`User filter not matched: lead.assigned_user_id=${leadAssignedUserId}, filter_user_id=${filterUserId}`);
      return false;
    }
  }

  const configuredCampaignId = (config.campaign_id || config.filter_campaign_id) as string | undefined;
  if (configuredCampaignId && configuredCampaignId !== data.campaign_id) {
    console.log(`Campaign id filter not matched: lead.campaign_id=${data.campaign_id}, filter.campaign_id=${configuredCampaignId}`);
    return false;
  }

  const configuredCampaignName = (config.campaign_name || config.filter_campaign_name) as string | undefined;
  if (configuredCampaignName) {
    const leadCampaignName = String(data.campaign_name || "").trim().toLowerCase();
    if (leadCampaignName !== configuredCampaignName.trim().toLowerCase()) {
      console.log(`Campaign name filter not matched: lead.campaign_name=${data.campaign_name}, filter.campaign_name=${configuredCampaignName}`);
      return false;
    }
  }

  switch (triggerType) {
    case "message_received":
      // Check session filter if configured
      if (config.session_id && config.session_id !== data.session_id) {
        return false;
      }
      // Check keyword filter if configured
      if (config.keyword) {
        const message = (data.message as string || "").toLowerCase();
        const keyword = (config.keyword as string).toLowerCase();
        if (!message.includes(keyword)) {
          return false;
        }
      }
      return true;

    case "stage_change":
    case "lead_stage_changed":
      // Check specific stage transition
      if (config.from_stage_id && config.from_stage_id !== data.old_stage_id) {
        return false;
      }
      if (config.to_stage_id && config.to_stage_id !== data.new_stage_id) {
        return false;
      }
      return true;

    case "lead_created":
      // Check source if configured
      if (config.source && config.source !== data.source) {
        console.log(`Source filter not matched: lead.source=${data.source}, filter.source=${config.source}`);
        return false;
      }
      // Check meta form id if configured
      if (config.meta_form_id && config.meta_form_id !== data.meta_form_id) {
        console.log(`Meta form filter not matched: lead.meta_form_id=${data.meta_form_id}, filter.meta_form_id=${config.meta_form_id}`);
        return false;
      }
      return true;

    case "tag_added":
    case "tag_removed":
      // Check specific tag if configured
      if (config.tag_id && config.tag_id !== data.tag_id) {
        return false;
      }
      return true;

    default:
      return true;
  }
}
