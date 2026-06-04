import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { conversation_id, session_id, organization_id, message, contact_name } = body;

    if (!conversation_id || !organization_id || !message) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ai-agent-responder] Processing message for conversation ${conversation_id}`);

    // 1. Find active agent for this session or organization
    let agentQuery = supabase
      .from("ai_agents")
      .select("*")
      .eq("organization_id", organization_id)
      .eq("is_active", true);

    if (session_id) {
      agentQuery = agentQuery.eq("session_id", session_id);
    }

    const { data: agents } = await agentQuery.limit(1);

    // If no agent with specific session, try org-wide agent
    let agent = agents?.[0];
    if (!agent && session_id) {
      const { data: fallbackAgents } = await supabase
        .from("ai_agents")
        .select("*")
        .eq("organization_id", organization_id)
        .eq("is_active", true)
        .is("session_id", null)
        .limit(1);
      agent = fallbackAgents?.[0];
    }

    if (!agent) {
      console.log(`[ai-agent-responder] No active agent found for org ${organization_id}`);
      return new Response(
        JSON.stringify({ success: true, message: "No active agent found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check if this conversation is already tracked
    const { data: existingConv } = await supabase
      .from("ai_agent_conversations")
      .select("*")
      .eq("conversation_id", conversation_id)
      .maybeSingle();

    const agentConv = existingConv;

    // If handed off, stop responding
    if (agentConv?.status === "handed_off" || agentConv?.status === "completed") {
      console.log(`[ai-agent-responder] Conversation ${conversation_id} is ${agentConv.status}, skipping`);
      return new Response(
        JSON.stringify({ success: true, message: `Conversation is ${agentConv.status}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Get conversation's lead_id
    const { data: conversation } = await supabase
      .from("whatsapp_conversations")
      .select("lead_id")
      .eq("id", conversation_id)
      .maybeSingle();

    const lead_id = agentConv?.lead_id || conversation?.lead_id;

    // 4. Check handoff conditions BEFORE responding
    const messageCount = (agentConv?.message_count || 0) + 1;
    const handoffKeywords = agent.handoff_keywords || [];
    const messageLower = message.toLowerCase();
    const keywordMatch = handoffKeywords.some((kw: string) =>
      messageLower.includes(kw.toLowerCase())
    );
    const limitReached = messageCount > agent.max_messages_before_handoff;

    if (keywordMatch || limitReached) {
      console.log(`[ai-agent-responder] Handoff triggered: keyword=${keywordMatch}, limit=${limitReached}`);

      // Send handoff message
      const handoffMsg = "Entendido! Vou transferir você para um de nossos atendentes. Um momento, por favor. 🙏";
      await insertOutboxMessage(supabase, conversation_id, handoffMsg);

      // Update or create conversation record as handed_off
      if (agentConv) {
        await supabase
          .from("ai_agent_conversations")
          .update({ status: "handed_off", handed_off_at: new Date().toISOString(), message_count: messageCount })
          .eq("id", agentConv.id);
      } else {
        await supabase
          .from("ai_agent_conversations")
          .insert({
            agent_id: agent.id,
            conversation_id,
            lead_id,
            status: "handed_off",
            message_count: messageCount,
            handed_off_at: new Date().toISOString(),
          });
      }

      return new Response(
        JSON.stringify({ success: true, action: "handed_off" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Fetch message history (last 20)
    const { data: historyMessages } = await supabase
      .from("whatsapp_messages")
      .select("content, from_me, message_type, created_at")
      .eq("conversation_id", conversation_id)
      .eq("message_type", "text")
      .order("created_at", { ascending: false })
      .limit(20);

    const chatHistory = (historyMessages || []).reverse().map((msg: any) => ({
      role: msg.from_me ? "assistant" : "user",
      content: msg.content || "",
    }));

    // 6. Fetch lead context
    let leadContext = "";
    if (lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("name, phone, email, cidade, bairro, uf, empresa, profissao, cargo, renda_familiar, procura_financiamento, message")
        .eq("id", lead_id)
        .maybeSingle();

      if (lead) {
        leadContext = `
[CONTEXTO DO LEAD]
Nome: ${lead.name || contact_name || "Não informado"}
Telefone: ${lead.phone || "Não informado"}
Email: ${lead.email || "Não informado"}
${lead.cidade ? `Cidade: ${lead.cidade}` : ""}${lead.bairro ? ` / Bairro: ${lead.bairro}` : ""}${lead.uf ? ` / UF: ${lead.uf}` : ""}
${lead.empresa ? `Empresa: ${lead.empresa}` : ""}
${lead.profissao ? `Profissão: ${lead.profissao}` : ""}
${lead.message ? `Mensagem inicial: ${lead.message}` : ""}
${lead.procura_financiamento ? `Busca financiamento: Sim` : ""}
`.trim();
      }
    } else if (contact_name) {
      leadContext = `[CONTEXTO DO CONTATO]\nNome: ${contact_name}`;
    }

    // 7. Fetch available properties (last 5) or service plans
    let catalogContext = "";

    const { data: properties } = await supabase
      .from("properties")
      .select("title, preco, quartos, banheiros, suites, area_util, cidade, bairro, tipo_de_negocio, tipo_de_imovel, status")
      .eq("organization_id", organization_id)
      .eq("status", "available")
      .order("created_at", { ascending: false })
      .limit(5);

    if (properties && properties.length > 0) {
      const propList = properties.map((p: any) => {
        const parts = [];
        if (p.tipo_de_imovel) parts.push(p.tipo_de_imovel);
        if (p.bairro || p.cidade) parts.push(`em ${[p.bairro, p.cidade].filter(Boolean).join(", ")}`);
        if (p.quartos) parts.push(`${p.quartos} quartos`);
        if (p.area_util) parts.push(`${p.area_util}m²`);
        if (p.preco) parts.push(`R$ ${Number(p.preco).toLocaleString("pt-BR")}`);
        return `• ${p.title || parts.join(", ")}`;
      }).join("\n");
      catalogContext += `\n\n[IMÓVEIS DISPONÍVEIS]\n${propList}`;
    }

    const { data: plans } = await supabase
      .from("service_plans")
      .select("name, category, price, speed_mb, features")
      .eq("organization_id", organization_id)
      .order("price", { ascending: true })
      .limit(5);

    if (plans && plans.length > 0) {
      const planList = plans.map((p: any) => {
        const parts = [`• ${p.name}`];
        if (p.speed_mb) parts.push(`${p.speed_mb}MB`);
        if (p.price) parts.push(`R$ ${Number(p.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
        return parts.join(" - ");
      }).join("\n");
      catalogContext += `\n\n[PLANOS DISPONÍVEIS]\n${planList}`;
    }

    // 8. Build system prompt
    const defaultSystemPrompt = `Você é um assistente de atendimento ao cliente. Responda de forma amigável, objetiva e profissional. 
Ajude o cliente com dúvidas sobre produtos, serviços e informações gerais.
Seja conciso nas respostas. Se o cliente quiser falar com um humano, informe que ele pode digitar "falar com atendente".`;

    const systemPromptBase = agent.system_prompt || defaultSystemPrompt;
    const fullSystemPrompt = [systemPromptBase, leadContext, catalogContext]
      .filter(Boolean)
      .join("\n\n");

    // 9. Call Lovable AI Gateway
    let aiResponse = "";

    if (!LOVABLE_API_KEY) {
      console.error("[ai-agent-responder] LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    aiResponse = await callLovableAI(LOVABLE_API_KEY, fullSystemPrompt, chatHistory, message);

    if (!aiResponse) {
      console.error("[ai-agent-responder] Empty AI response");
      return new Response(
        JSON.stringify({ success: false, error: "Empty AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 10. Save response to outbox
    await insertOutboxMessage(supabase, conversation_id, aiResponse);

    // 11. Update or create ai_agent_conversations record
    if (agentConv) {
      await supabase
        .from("ai_agent_conversations")
        .update({ message_count: messageCount })
        .eq("id", agentConv.id);
    } else {
      await supabase
        .from("ai_agent_conversations")
        .insert({
          agent_id: agent.id,
          conversation_id,
          lead_id,
          status: "active",
          message_count: messageCount,
        });
    }

    console.log(`[ai-agent-responder] Successfully responded to conversation ${conversation_id}`);

    return new Response(
      JSON.stringify({ success: true, response: aiResponse }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[ai-agent-responder] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function callLovableAI(
  apiKey: string,
  systemPrompt: string,
  history: { role: string; content: string }[],
  userMessage: string
): Promise<string> {
  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages,
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (response.status === 429) {
    throw new Error("Rate limit exceeded - too many requests");
  }
  if (response.status === 402) {
    throw new Error("Payment required - AI credits exhausted");
  }
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Lovable AI error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function insertOutboxMessage(
  supabase: any,
  conversation_id: string,
  content: string
): Promise<void> {
  const { data: conv } = await supabase
    .from("whatsapp_conversations")
    .select("session_id, remote_jid, organization_id")
    .eq("id", conversation_id)
    .maybeSingle() as { data: any };

  if (!conv) {
    console.error("[ai-agent-responder] Could not find conversation for outbox");
    return;
  }

  const { error } = await supabase.from("outbox_messages").insert({
    conversation_id,
    session_id: conv.session_id,
    organization_id: conv.organization_id,
    remote_jid: conv.remote_jid,
    content,
    message_type: "text",
    status: "pending",
  });

  if (error) {
    console.error("[ai-agent-responder] Error inserting outbox message:", error);
    throw error;
  }

  // Trigger message-sender
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/message-sender`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({}),
    });
  } catch (e) {
    console.error("[ai-agent-responder] Error triggering message-sender:", e);
  }
}
