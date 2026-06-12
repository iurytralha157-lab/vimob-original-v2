import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_HISTORY_LIMIT = 8;
const DEFAULT_SITE_BASE_URL = "https://vimob.vettercompany.com.br";
const HUMAN_TAKEOVER_LOOKBACK_HOURS = 6;

type ChatMessage = { role: "user" | "assistant"; content: string };
type PropertyCandidate = Record<string, any> & { score?: number; public_url?: string | null };

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
      return json({ success: false, error: "Missing required fields" }, 400);
    }

    console.log(`[ai-agent-responder] Processing message for conversation ${conversation_id}`);

    const agent = await findActiveAgent(supabase, organization_id, session_id);
    if (!agent) {
      console.log(`[ai-agent-responder] No active agent found for org ${organization_id}`);
      return json({ success: true, message: "No active agent found" });
    }

    const conversation = await getConversation(supabase, conversation_id);
    if (!conversation || conversation.is_group) {
      return json({ success: true, message: "Conversation not eligible for AI" });
    }

    const agentConv = await getAgentConversation(supabase, conversation_id);
    if (agentConv?.status === "handed_off" || agentConv?.status === "completed") {
      console.log(`[ai-agent-responder] Conversation ${conversation_id} is ${agentConv.status}, skipping`);
      return json({ success: true, message: `Conversation is ${agentConv.status}` });
    }

    const lead = await resolveLead(supabase, organization_id, conversation, agentConv?.lead_id, contact_name);
    const sessionOwnerId = conversation.session?.owner_user_id || null;
    const takeoverSince = agentConv?.started_at || hoursAgo(HUMAN_TAKEOVER_LOOKBACK_HOURS);
    const humanTakeover = await detectHumanTakeover(supabase, conversation_id, takeoverSince);

    if (humanTakeover.detected) {
      await markHandedOff(supabase, agent, conversation_id, lead?.id || null, agentConv, humanTakeover.reason);
      await notifyHumanNeeded(supabase, organization_id, lead, sessionOwnerId, conversation_id, humanTakeover.reason);
      return json({ success: true, action: "human_takeover_detected" });
    }

    const messageCount = (agentConv?.message_count || 0) + 1;
    const handoffKeywords = agent.handoff_keywords || [];
    const keywordMatch = containsKeyword(message, handoffKeywords);
    const limitReached = agent.max_messages_before_handoff
      ? messageCount > agent.max_messages_before_handoff
      : false;

    if (keywordMatch || limitReached) {
      const reason = keywordMatch ? "keyword" : "message_limit";
      const handoffMsg = "Entendido. Vou chamar um atendente para continuar por aqui.";
      await insertOutboxMessage(supabase, conversation_id, handoffMsg);
      await markHandedOff(supabase, agent, conversation_id, lead?.id || null, agentConv, reason, messageCount);
      await notifyHumanNeeded(supabase, organization_id, lead, sessionOwnerId, conversation_id, reason);
      return json({ success: true, action: "handed_off" });
    }

    const publicBaseUrl = await getPublicSiteBaseUrl(supabase, organization_id);
    const mentionedProperties = await findMentionedProperties(supabase, organization_id, message, publicBaseUrl);
    const leadContext = await buildLeadContext(supabase, lead, contact_name);
    const bestProperties = await searchBestProperties(
      supabase,
      organization_id,
      message,
      lead,
      mentionedProperties,
      publicBaseUrl,
    );

    const selectedProperty = mentionedProperties[0] || bestProperties[0] || leadContext.currentProperty || null;
    const visitAction = await maybeCreateVisitSchedule(supabase, {
      organizationId: organization_id,
      conversationId: conversation_id,
      message,
      lead,
      sessionOwnerId,
      property: selectedProperty,
    });

    const historyLimit = Math.min(DEFAULT_HISTORY_LIMIT, Math.max(4, agent.max_messages_before_handoff || DEFAULT_HISTORY_LIMIT));
    const history = await getCompactHistory(supabase, conversation_id, message, historyLimit);
    const memorySummary = buildMemorySummary({
      previous: agentConv?.memory_summary || "",
      lead,
      leadMeta: leadContext.leadMeta,
      selectedProperty,
      visitAction,
      message,
    });

    const fullSystemPrompt = buildSystemPrompt({
      agent,
      leadContext,
      mentionedProperties,
      bestProperties,
      memorySummary,
      visitAction,
    });

    if (!LOVABLE_API_KEY) {
      console.error("[ai-agent-responder] LOVABLE_API_KEY not configured");
      return json({ success: false, error: "LOVABLE_API_KEY not configured" }, 500);
    }

    let aiResponse = await callLovableAI(LOVABLE_API_KEY, fullSystemPrompt, history);
    aiResponse = appendActionConfirmation(aiResponse, visitAction);

    if (!aiResponse) {
      console.error("[ai-agent-responder] Empty AI response");
      return json({ success: false, error: "Empty AI response" }, 500);
    }

    await insertOutboxMessage(supabase, conversation_id, aiResponse);
    await upsertAgentConversation(supabase, {
      agent,
      agentConv,
      conversationId: conversation_id,
      leadId: lead?.id || null,
      messageCount,
      memorySummary,
      property: selectedProperty,
    });

    console.log(`[ai-agent-responder] Successfully responded to conversation ${conversation_id}`);
    return json({ success: true, response: aiResponse });
  } catch (error) {
    console.error("[ai-agent-responder] Error:", error);
    return json({ success: false, error: String(error) }, 500);
  }
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function findActiveAgent(supabase: any, organizationId: string, sessionId?: string | null) {
  let agentQuery = supabase
    .from("ai_agents")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (sessionId) agentQuery = agentQuery.eq("session_id", sessionId);
  const { data: agents } = await agentQuery.limit(1);
  let agent = agents?.[0];

  if (!agent && sessionId) {
    const { data: fallbackAgents } = await supabase
      .from("ai_agents")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .is("session_id", null)
      .limit(1);
    agent = fallbackAgents?.[0];
  }

  return agent || null;
}

async function getConversation(supabase: any, conversationId: string) {
  const { data } = await supabase
    .from("whatsapp_conversations")
    .select("id, organization_id, session_id, lead_id, remote_jid, contact_phone, contact_name, is_group, session:whatsapp_sessions(owner_user_id, organization_id)")
    .eq("id", conversationId)
    .maybeSingle();

  return data || null;
}

async function getAgentConversation(supabase: any, conversationId: string) {
  const { data } = await supabase
    .from("ai_agent_conversations")
    .select("*")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  return data || null;
}

async function resolveLead(
  supabase: any,
  organizationId: string,
  conversation: any,
  storedLeadId?: string | null,
  contactName?: string | null,
) {
  const leadId = storedLeadId || conversation.lead_id;
  if (leadId) return await fetchLead(supabase, leadId);

  const phone = conversation.contact_phone || conversation.remote_jid || "";
  const variants = phoneVariants(phone);
  if (!variants.length) return null;

  const { data } = await supabase
    .from("leads")
    .select(leadSelect())
    .eq("organization_id", organizationId)
    .or(variants.map((variant) => `phone.ilike.%${variant}%`).join(","))
    .limit(20);

  const matchedLead = (data || []).find((candidate: any) => phonesMatch(candidate.phone || "", phone)) || null;
  if (matchedLead?.id) {
    await supabase
      .from("whatsapp_conversations")
      .update({
        lead_id: matchedLead.id,
        contact_name: matchedLead.name || contactName || conversation.contact_name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);
  }
  return matchedLead;
}

async function fetchLead(supabase: any, leadId: string) {
  const { data } = await supabase
    .from("leads")
    .select(leadSelect())
    .eq("id", leadId)
    .maybeSingle();
  return data || null;
}

function leadSelect() {
  return [
    "id",
    "organization_id",
    "name",
    "phone",
    "email",
    "message",
    "initial_message",
    "cidade",
    "bairro",
    "uf",
    "empresa",
    "profissao",
    "cargo",
    "renda_familiar",
    "procura_financiamento",
    "faixa_valor_imovel",
    "valor_interesse",
    "finalidade_compra",
    "property_code",
    "property_id",
    "interest_property_id",
    "pipeline_id",
    "stage_id",
    "assigned_user_id",
    "source",
    "meta_form_id",
    "created_at",
    "stage:stages(name, stage_key)",
    "pipeline:pipelines(name)",
  ].join(", ");
}

async function buildLeadContext(supabase: any, lead: any, fallbackName?: string | null) {
  if (!lead?.id) {
    return {
      lead,
      leadMeta: [],
      currentProperty: null,
      text: fallbackName ? `[CONTEXTO DO CONTATO]\nNome: ${fallbackName}` : "",
    };
  }

  const { data: leadMeta } = await supabase
    .from("lead_meta")
    .select("form_id, form_name, campaign_name, ad_name, adset_name, platform, contact_notes, raw_payload, created_at")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(3);

  const propertyId = lead.interest_property_id || lead.property_id || null;
  const currentProperty = propertyId ? await fetchPropertyById(supabase, propertyId) : null;
  const lines = [
    "[CONTEXTO DO LEAD]",
    line("Nome", lead.name),
    line("Telefone", lead.phone),
    line("Email", lead.email),
    line("Origem", lead.source),
    line("Pipeline", lead.pipeline?.name),
    line("Coluna", lead.stage?.name),
    line("Cidade", joinParts([lead.bairro, lead.cidade, lead.uf])),
    line("Empresa", lead.empresa),
    line("Profissao", lead.profissao),
    line("Cargo", lead.cargo),
    line("Renda familiar", lead.renda_familiar),
    line("Faixa de valor", lead.faixa_valor_imovel),
    line("Valor de interesse", formatCurrency(lead.valor_interesse)),
    lead.procura_financiamento ? "Busca financiamento: sim" : "",
    line("Finalidade", lead.finalidade_compra),
    line("Mensagem inicial", lead.message || lead.initial_message),
    line("Imovel de interesse", currentProperty ? propertyLine(currentProperty) : lead.property_code),
  ].filter(Boolean);

  const metaLines = formatLeadMeta(leadMeta || []);
  return {
    lead,
    leadMeta: leadMeta || [],
    currentProperty,
    text: [...lines, ...metaLines].join("\n"),
  };
}

function formatLeadMeta(rows: any[]) {
  if (!rows.length) return [];

  const lines = ["", "[RESPOSTAS E ORIGEM META]"];
  for (const row of rows) {
    lines.push(
      [
        line("Formulario", row.form_name || row.form_id),
        line("Campanha", row.campaign_name),
        line("Conjunto", row.adset_name),
        line("Anuncio", row.ad_name),
        line("Plataforma", row.platform),
        line("Notas do formulario", row.contact_notes),
      ].filter(Boolean).join("\n"),
    );

    for (const answer of extractMetaAnswers(row.raw_payload)) {
      lines.push(`Resposta: ${answer}`);
    }
  }
  return lines.filter(Boolean);
}

function extractMetaAnswers(raw: any): string[] {
  const payload = parseJsonValue(raw);
  const fieldData = payload?.field_data || payload?.fieldData || payload?.data?.field_data || [];
  if (!Array.isArray(fieldData)) return [];

  return fieldData
    .map((field: any) => {
      const value = Array.isArray(field.values) ? field.values.filter(Boolean).join(", ") : field.value;
      if (!field.name || !value) return "";
      return `${field.name}: ${value}`;
    })
    .filter(Boolean)
    .slice(0, 12);
}

async function fetchPropertyById(supabase: any, propertyId: string) {
  const { data } = await supabase
    .from("properties")
    .select(propertySelect())
    .eq("id", propertyId)
    .maybeSingle();
  return data || null;
}

async function findMentionedProperties(
  supabase: any,
  organizationId: string,
  message: string,
  publicBaseUrl: string | null,
): Promise<PropertyCandidate[]> {
  const codes = extractPropertyCodes(message);
  if (!codes.length) return [];

  const orFilter = codes.map((code) => `code.ilike.%${code}%`).join(",");
  const { data, error } = await supabase
    .from("properties")
    .select(propertySelect())
    .eq("organization_id", organizationId)
    .or(orFilter)
    .limit(8);

  if (error) {
    console.error("[ai-agent-responder] property code lookup error:", error);
    return [];
  }

  return (data || [])
    .map((property: any) => ({
      ...property,
      score: codes.includes(normalizeCode(property.code)) ? 100 : 80,
      public_url: propertyPublicUrl(publicBaseUrl, property.code),
    }))
    .sort((a: PropertyCandidate, b: PropertyCandidate) => (b.score || 0) - (a.score || 0));
}

async function searchBestProperties(
  supabase: any,
  organizationId: string,
  message: string,
  lead: any,
  mentionedProperties: PropertyCandidate[],
  publicBaseUrl: string | null,
): Promise<PropertyCandidate[]> {
  const { data, error } = await supabase
    .from("properties")
    .select(propertySelect())
    .eq("organization_id", organizationId)
    .order("destaque", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    console.error("[ai-agent-responder] property search error:", error);
    return mentionedProperties.slice(0, 5);
  }

  const mentionedIds = new Set(mentionedProperties.map((property) => property.id));
  const scored = (data || [])
    .filter(isOfferableProperty)
    .map((property: any) => ({
      ...property,
      score: scoreProperty(property, lead, message, mentionedIds.has(property.id)),
      public_url: propertyPublicUrl(publicBaseUrl, property.code),
    }))
    .filter((property: PropertyCandidate) => (property.score || 0) > 0)
    .sort((a: PropertyCandidate, b: PropertyCandidate) => (b.score || 0) - (a.score || 0));

  const merged = [...mentionedProperties, ...scored].filter(uniqueById);
  return merged.slice(0, 5);
}

function propertySelect() {
  return [
    "id",
    "organization_id",
    "code",
    "title",
    "descricao",
    "tipo_de_imovel",
    "tipo_de_negocio",
    "status",
    "destaque",
    "bairro",
    "cidade",
    "uf",
    "quartos",
    "suites",
    "banheiros",
    "vagas",
    "area_util",
    "area_total",
    "preco",
    "valor_locacao",
    "imagem_principal",
    "created_at",
  ].join(", ");
}

function isOfferableProperty(property: any) {
  const status = normalizeText(property.status || "");
  if (!status) return true;
  return !["inativo", "vendido", "locado", "indisponivel", "arquivado", "excluido"].some((blocked) =>
    status.includes(blocked)
  );
}

function scoreProperty(property: any, lead: any, message: string, mentioned: boolean) {
  const text = normalizeText(message);
  const leadCity = normalizeText(lead?.cidade || "");
  const leadNeighborhood = normalizeText(lead?.bairro || "");
  const propertyCity = normalizeText(property.cidade || "");
  const propertyNeighborhood = normalizeText(property.bairro || "");
  const desiredBedrooms = extractBedrooms(message);
  const desiredBudget = extractBudget(message) || Number(lead?.valor_interesse || 0);

  let score = mentioned ? 80 : 1;
  if (property.destaque) score += 4;
  if (propertyNeighborhood && (text.includes(propertyNeighborhood) || propertyNeighborhood === leadNeighborhood)) score += 12;
  if (propertyCity && (text.includes(propertyCity) || propertyCity === leadCity)) score += 8;
  if (desiredBedrooms && Number(property.quartos || 0) >= desiredBedrooms) score += 7;
  if (desiredBudget && Number(property.preco || property.valor_locacao || 0) > 0) {
    const price = Number(property.preco || property.valor_locacao);
    if (price <= desiredBudget) score += 6;
    else if (price <= desiredBudget * 1.15) score += 3;
  }
  if (property.tipo_de_imovel && text.includes(normalizeText(property.tipo_de_imovel))) score += 4;
  if (property.tipo_de_negocio && text.includes(normalizeText(property.tipo_de_negocio))) score += 3;
  return score;
}

async function maybeCreateVisitSchedule(supabase: any, input: {
  organizationId: string;
  conversationId: string;
  message: string;
  lead: any;
  sessionOwnerId: string | null;
  property: any;
}) {
  const visitDate = parseVisitDate(input.message);
  if (!visitDate || !input.lead?.id) return null;

  const userId = input.lead.assigned_user_id || input.sessionOwnerId;
  if (!userId) return { requested: true, created: false, reason: "missing_user" };

  const start = visitDate.toISOString();
  const end = new Date(visitDate.getTime() + 45 * 60 * 1000).toISOString();

  const { data: duplicate } = await supabase
    .from("schedule_events")
    .select("id")
    .eq("lead_id", input.lead.id)
    .eq("event_type", "visit")
    .gte("start_time", new Date(visitDate.getTime() - 15 * 60 * 1000).toISOString())
    .lte("start_time", new Date(visitDate.getTime() + 15 * 60 * 1000).toISOString())
    .limit(1);

  if (duplicate?.length) {
    return { requested: true, created: false, reason: "duplicate", start_time: start };
  }

  const title = `Visita - ${input.lead.name || "Lead"}`;
  const description = [
    "Solicitada pelo WhatsApp com a Jhenny.",
    input.property?.code ? `Imovel: ${input.property.code}` : "",
    `Mensagem: ${truncate(input.message, 320)}`,
  ].filter(Boolean).join("\n");

  const { data: event, error } = await supabase
    .from("schedule_events")
    .insert({
      organization_id: input.organizationId,
      user_id: userId,
      lead_id: input.lead.id,
      property_id: input.property?.id || input.lead.interest_property_id || input.lead.property_id || null,
      title,
      description,
      event_type: "visit",
      start_time: start,
      end_time: end,
      status: "scheduled",
      visibility: "default",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[ai-agent-responder] schedule insert error:", error);
    return { requested: true, created: false, reason: error.message };
  }

  await supabase.from("schedule_event_assignees").insert({
    event_id: event.id,
    user_id: userId,
    organization_id: input.organizationId,
  }).then(() => {}, () => {});

  await supabase.from("activities").insert({
    lead_id: input.lead.id,
    user_id: null,
    type: "visit_scheduled",
    content: `Visita agendada pela Jhenny para ${formatDateTimePtBR(visitDate)}.`,
    metadata: {
      is_automation: true,
      source: "jhenny",
      conversation_id: input.conversationId,
      schedule_event_id: event.id,
      property_id: input.property?.id || null,
    },
  }).then(() => {}, () => {});

  await moveLeadToVisitStage(supabase, input.lead, input.organizationId);
  await notifyUser(supabase, input.organizationId, userId, input.lead.id, {
    title: "Visita agendada pela Jhenny",
    content: `${input.lead.name || "Lead"} agendou visita para ${formatDateTimePtBR(visitDate)}.`,
    type: "visit_scheduled",
  });

  return { requested: true, created: true, start_time: start, event_id: event.id };
}

async function moveLeadToVisitStage(supabase: any, lead: any, organizationId: string) {
  if (!lead?.id || !lead.pipeline_id) return;

  const { data: stages } = await supabase
    .from("stages")
    .select("id, name, stage_key, pipeline_id")
    .eq("pipeline_id", lead.pipeline_id);

  const target = (stages || []).find((stage: any) => {
    const value = normalizeText(`${stage.name || ""} ${stage.stage_key || ""}`);
    return value.includes("visit") && (value.includes("agend") || value.includes("marcad"));
  });

  if (!target?.id || target.id === lead.stage_id) return;

  await supabase
    .from("leads")
    .update({
      stage_id: target.id,
      pipeline_id: target.pipeline_id,
      stage_entered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", lead.id)
    .eq("organization_id", organizationId);
}

async function getCompactHistory(supabase: any, conversationId: string, currentMessage: string, limit: number) {
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("content, from_me, message_type, sent_at, created_at")
    .eq("conversation_id", conversationId)
    .eq("message_type", "text")
    .order("sent_at", { ascending: false })
    .limit(limit);

  const history = (data || [])
    .reverse()
    .map((msg: any) => ({
      role: msg.from_me ? "assistant" as const : "user" as const,
      content: truncate(String(msg.content || ""), 900),
    }))
    .filter((msg: ChatMessage) => msg.content.trim() !== "");

  const last = history[history.length - 1];
  if (!last || last.role !== "user" || normalizeText(last.content) !== normalizeText(currentMessage)) {
    history.push({ role: "user", content: truncate(currentMessage, 900) });
  }

  return history;
}

function buildSystemPrompt(input: {
  agent: any;
  leadContext: any;
  mentionedProperties: PropertyCandidate[];
  bestProperties: PropertyCandidate[];
  memorySummary: string;
  visitAction: any;
}) {
  const defaultSystemPrompt =
    "Voce e a Jhenny, assistente comercial imobiliaria do Vimob. Responda com clareza, cuidado e objetividade.";
  const systemPromptBase = input.agent.system_prompt || defaultSystemPrompt;
  const propertyContext = formatPropertyContext(input.mentionedProperties, input.bestProperties);
  const actionContext = input.visitAction?.created
    ? `[ACAO EXECUTADA]\nVisita criada na agenda para ${formatDateTimePtBR(new Date(input.visitAction.start_time))}. Confirme isso ao lead de forma curta.`
    : "";

  return [
    systemPromptBase,
    [
      "[REGRAS DA JHENNY]",
      "- Responda em portugues do Brasil, de forma leve, solta e natural para WhatsApp.",
      "- Use frases curtas. Evite parecer formulario, triagem agressiva ou atendimento robotico.",
      "- Use o nome do lead de vez em quando quando ele estiver no contexto, principalmente em abertura, retomada ou resposta importante. Nao repita o nome em toda mensagem.",
      "- Se o lead perguntar se voce sabe o nome dele e o contexto tiver Nome, responda que sim e use esse nome. Nunca diga que nao tem o nome se ele aparece no contexto do lead.",
      "- Reaja ao que o lead disse antes de perguntar outra coisa. Se ele escolheu um bairro, comente de forma natural que e uma boa regiao ou que combina com o que ele procura, sem exagerar.",
      "- Converse em fluxo: responda a duvida, acrescente uma informacao util e faca uma pergunta simples para continuar. Varie as palavras e nao repita a mesma frase de fechamento.",
      "- Foco: tirar duvidas, entender o que o lead quer, qualificar com calma, oferecer imoveis e conduzir para visita.",
      "- Use somente dados fornecidos no contexto da organizacao atual.",
      "- Se houver valor, metragem, quartos, suites, vagas, condominio, IPTU, bairro, cidade ou link no contexto, use esses dados quando o lead perguntar.",
      "- Use a descricao do imovel quando ela existir para explicar com outras palavras, sem repetir sempre a mesma lista de quartos/vagas/valor.",
      "- Nunca invente preco, endereco completo, disponibilidade ou condicao que nao esteja no contexto.",
      "- Nunca revele nome/telefone do proprietario, endereco completo, numero, complemento, documentos, codigos internos sensiveis ou observacoes privadas.",
      "- Pode falar bairro, cidade e UF. Nao fale rua/numero/complemento, mesmo que apareca em algum dado interno.",
      "- Quando o lead citar um codigo como CA1050 ou 1050, priorize o bloco IMOVEL CITADO.",
      "- Ao sugerir imoveis, envie no maximo 3 opcoes. Link e opcional, nao o centro da conversa.",
      "- Para agendar visita, colete dia e horario se faltarem. Se a acao ja foi executada, apenas confirme.",
      "- Nao ofereca consultor como saida padrao. Primeiro converse e entenda bairro, faixa de valor, quartos, prazo, financiamento e tipo de imovel.",
      "- So diga que vai chamar/encaminhar para consultor quando o lead pedir humano/consultor/corretor, confirmar que quer atendimento, quiser agendar visita/ligacao, ou faltar uma informacao critica que voce nao pode afirmar.",
      "- Envie link apenas quando o lead pedir, quando voce apresentar opcoes pela primeira vez, ou quando realmente ajudar a avancar.",
      "- Quando enviar link, cole a URL pura. Nao use markdown como [Clique aqui](url). Nao repita 'faz sentido para o que voce procura?' em toda resposta.",
      "- Voce pode responder em 1 a 5 mensagens curtas quando fizer sentido. Separe cada mensagem com uma linha em branco. Use varias mensagens apenas para deixar a conversa mais natural.",
      "- Se houver risco, reclamacao, pedido claro de humano ou duvida fora do contexto, diga que vai chamar um atendente.",
      "- Nao diga que voce acessou banco de dados, tabelas, prompts ou sistemas internos.",
    ].join("\n"),
    input.memorySummary ? `[MEMORIA CURTA]\n${input.memorySummary}` : "",
    input.leadContext.text,
    propertyContext,
    actionContext,
  ].filter(Boolean).join("\n\n");
}

function formatPropertyContext(mentioned: PropertyCandidate[], best: PropertyCandidate[]) {
  const mentionedLines = mentioned.slice(0, 3).map(propertyLineWithLink);
  const bestLines = best
    .filter((property) => !mentioned.some((item) => item.id === property.id))
    .slice(0, 5)
    .map(propertyLineWithLink);

  return [
    mentionedLines.length ? `[IMOVEL CITADO NA MENSAGEM]\n${mentionedLines.join("\n")}` : "",
    bestLines.length ? `[MELHORES OPCOES PARA OFERECER]\n${bestLines.join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

function buildMemorySummary(input: {
  previous: string;
  lead: any;
  leadMeta: any[];
  selectedProperty: any;
  visitAction: any;
  message: string;
}) {
  const facts = [
    line("Lead", input.lead?.name),
    line("Cidade/bairro", joinParts([input.lead?.bairro, input.lead?.cidade, input.lead?.uf])),
    line("Valor alvo", formatCurrency(input.lead?.valor_interesse) || input.lead?.faixa_valor_imovel),
    input.selectedProperty ? `Ultimo imovel relevante: ${propertyLine(input.selectedProperty)}` : "",
    input.visitAction?.created ? `Visita agendada: ${formatDateTimePtBR(new Date(input.visitAction.start_time))}` : "",
    input.leadMeta?.[0]?.contact_notes ? `Formulario Meta: ${truncate(input.leadMeta[0].contact_notes, 220)}` : "",
    `Ultima mensagem do lead: ${truncate(input.message, 220)}`,
  ].filter(Boolean);

  const previous = input.previous ? `${truncate(input.previous, 420)}\n` : "";
  return truncate(`${previous}${facts.join("\n")}`, 1000);
}

async function callLovableAI(apiKey: string, systemPrompt: string, history: ChatMessage[]): Promise<string> {
  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
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
      max_tokens: 420,
      temperature: 0.35,
    }),
  });

  if (response.status === 429) throw new Error("Rate limit exceeded - too many requests");
  if (response.status === 402) throw new Error("Payment required - AI credits exhausted");
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Lovable AI error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function insertOutboxMessage(supabase: any, conversationId: string, content: string): Promise<void> {
  const { data: conv } = await supabase
    .from("whatsapp_conversations")
    .select("session_id, remote_jid, organization_id")
    .eq("id", conversationId)
    .maybeSingle() as { data: any };

  if (!conv) {
    console.error("[ai-agent-responder] Could not find conversation for outbox");
    return;
  }

  const chunks = splitAssistantMessages(content);
  let lastContent = chunks[chunks.length - 1] || content;
  let lastSentAt = new Date().toISOString();

  for (const chunk of chunks) {
    const clientMessageId = `jhenny-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    lastContent = chunk;
    lastSentAt = now;

    const { error } = await supabase.from("outbox_messages").insert({
      conversation_id: conversationId,
      session_id: conv.session_id,
      organization_id: conv.organization_id,
      content: chunk,
      message_type: "text",
      status: "pending",
      created_by: null,
      client_message_id: clientMessageId,
    });

    if (error) {
      console.error("[ai-agent-responder] Error inserting outbox message:", error);
      throw error;
    }

    const { error: historyError } = await supabase
      .from("whatsapp_messages")
      .upsert({
        conversation_id: conversationId,
        session_id: conv.session_id,
        message_id: clientMessageId,
        client_message_id: clientMessageId,
        from_me: true,
        content: chunk,
        message_type: "text",
        remote_jid: conv.remote_jid,
        status: "pending",
        sent_at: now,
        sender_name: "Jhenny",
      }, { onConflict: "session_id,message_id" });

    if (historyError) {
      console.error("[ai-agent-responder] Error inserting optimistic AI history:", historyError);
      throw historyError;
    }
  }

  await supabase
    .from("whatsapp_conversations")
    .update({
      last_message: lastContent,
      last_message_at: lastSentAt,
      unread_count: 0,
      updated_at: lastSentAt,
    })
    .eq("id", conversationId);

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

async function upsertAgentConversation(supabase: any, input: {
  agent: any;
  agentConv: any;
  conversationId: string;
  leadId: string | null;
  messageCount: number;
  memorySummary: string;
  property: any;
}) {
  await supabase
    .from("ai_agent_conversations")
    .upsert({
      id: input.agentConv?.id,
      agent_id: input.agent.id,
      conversation_id: input.conversationId,
      lead_id: input.leadId,
      status: "active",
      message_count: input.messageCount,
      memory_summary: input.memorySummary,
      last_user_message_at: new Date().toISOString(),
      last_ai_message_at: new Date().toISOString(),
      last_property_id: input.property?.id || null,
      last_property_code: input.property?.code || null,
    }, { onConflict: "conversation_id" });
}

async function markHandedOff(
  supabase: any,
  agent: any,
  conversationId: string,
  leadId: string | null,
  agentConv: any,
  reason: string,
  messageCount?: number,
) {
  await supabase
    .from("ai_agent_conversations")
    .upsert({
      id: agentConv?.id,
      agent_id: agent.id,
      conversation_id: conversationId,
      lead_id: leadId,
      status: "handed_off",
      message_count: messageCount ?? agentConv?.message_count ?? 0,
      handed_off_at: new Date().toISOString(),
      last_human_message_at: reason === "manual_message" ? new Date().toISOString() : agentConv?.last_human_message_at || null,
      handoff_reason: reason,
    }, { onConflict: "conversation_id" });
}

async function detectHumanTakeover(supabase: any, conversationId: string, since: string) {
  const { data: manualMessages } = await supabase
    .from("whatsapp_messages")
    .select("id, sender_name")
    .eq("conversation_id", conversationId)
    .eq("from_me", true)
    .not("sender_name", "is", null)
    .gte("sent_at", since)
    .limit(8);

  if ((manualMessages || []).some((message: any) => !isAutomationSenderName(message.sender_name))) {
    return { detected: true, reason: "manual_message" };
  }

  const { data: manualOutbox } = await supabase
    .from("outbox_messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .not("created_by", "is", null)
    .gte("created_at", since)
    .limit(1);

  if (manualOutbox?.length) return { detected: true, reason: "manual_outbox" };
  return { detected: false, reason: "" };
}

function isAutomationSenderName(value: string | null | undefined) {
  const name = normalizeText(value || "");
  if (!name) return false;
  return name.includes("jhenny")
    || name.includes("jenny")
    || name === "ia"
    || name === "ai"
    || name.startsWith("autom");
}

async function notifyHumanNeeded(
  supabase: any,
  organizationId: string,
  lead: any,
  fallbackUserId: string | null,
  conversationId: string,
  reason: string,
) {
  const userId = lead?.assigned_user_id || fallbackUserId;
  if (!userId) return;

  await notifyUser(supabase, organizationId, userId, lead?.id || null, {
    type: "ai_handoff",
    title: "Jhenny chamou atendimento humano",
    content: `${lead?.name || "Um lead"} precisa de atendimento humano. Motivo: ${reason}. Conversa: ${conversationId}.`,
  });
}

async function notifyUser(
  supabase: any,
  organizationId: string,
  userId: string,
  leadId: string | null,
  input: { title: string; content: string; type: string },
) {
  await supabase.from("notifications").insert({
    organization_id: organizationId,
    user_id: userId,
    lead_id: leadId,
    type: input.type,
    title: input.title,
    content: input.content,
    is_read: false,
  }).then(() => {}, (error: any) => console.error("[ai-agent-responder] notification error:", error));
}

async function getPublicSiteBaseUrl(supabase: any, organizationId: string) {
  const { data } = await supabase
    .from("organization_sites")
    .select("subdomain, custom_domain, domain_verified, is_active")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .maybeSingle();

  if (!data) return null;
  if (data.custom_domain && data.domain_verified) return `https://${data.custom_domain}`;
  if (data.subdomain) return `${DEFAULT_SITE_BASE_URL}/sites/${data.subdomain}`;
  return null;
}

function propertyPublicUrl(baseUrl: string | null, code: string | null | undefined) {
  if (!baseUrl || !code) return null;
  return `${baseUrl.replace(/\/+$/, "")}/imovel/${encodeURIComponent(code)}`;
}

function appendActionConfirmation(response: string, visitAction: any) {
  if (!visitAction?.created) return response;
  if (normalizeText(response).includes("visita") && normalizeText(response).includes("agend")) return response;
  return `${response.trim()}\n\nVisita agendada para ${formatDateTimePtBR(new Date(visitAction.start_time))}.`;
}

function containsKeyword(message: string, keywords: string[]) {
  const text = normalizeText(message);
  return keywords.some((keyword) => {
    const normalized = normalizeText(keyword);
    return normalized && text.includes(normalized);
  });
}

function extractPropertyCodes(message: string) {
  const candidates = new Set<string>();
  const upper = normalizeText(message).toUpperCase();
  const codeRegex = /\b([A-Z]{1,5}\s*-?\s*\d{2,7})\b/g;
  const numberRegex = /\b(?:IMOVEL|CODIGO|COD|REF|REFERENCIA)?\s*#?\s*(\d{3,7})\b/g;

  for (const match of upper.matchAll(codeRegex)) candidates.add(normalizeCode(match[1]));
  for (const match of upper.matchAll(numberRegex)) candidates.add(normalizeCode(match[1]));

  return Array.from(candidates).filter((code) => code.length >= 3).slice(0, 8);
}

function normalizeCode(value: string) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function parseVisitDate(message: string): Date | null {
  const text = normalizeText(message);
  if (!/(visita|visitar|conhecer|agenda|agendar|marcar|horario)/i.test(text)) return null;

  const dateMatch = message.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/);
  const timeMatch = message.match(/\b(\d{1,2})(?:h|:)(\d{0,2})\b/i);
  if (!dateMatch || !timeMatch) return null;

  const now = new Date();
  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const rawYear = dateMatch[3] ? Number(dateMatch[3]) : now.getFullYear();
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const hour = Number(timeMatch[1]);
  const minute = timeMatch[2] ? Number(timeMatch[2]) : 0;
  if (day < 1 || day > 31 || month < 1 || month > 12 || hour < 7 || hour > 22 || minute > 59) return null;

  const scheduled = new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00-03:00`);
  if (Number.isNaN(scheduled.getTime()) || scheduled.getTime() < now.getTime() - 60 * 60 * 1000) return null;
  return scheduled;
}

function extractBedrooms(message: string) {
  const match = normalizeText(message).match(/\b(\d{1,2})\s*(quarto|quartos|dormitorio|dormitorios|dorm)\b/);
  return match ? Number(match[1]) : null;
}

function extractBudget(message: string) {
  const normalized = normalizeText(message).replace(/\./g, "").replace(/,/g, ".");
  const match = normalized.match(/\b(?:ate|max|maximo|r\$)?\s*(\d{2,7})(?:\s*(mil|k|m|milhao|milhoes))?\b/);
  if (!match) return null;
  let value = Number(match[1]);
  const suffix = match[2] || "";
  if (suffix === "mil" || suffix === "k") value *= 1000;
  if (suffix === "m" || suffix.startsWith("milhao") || suffix.startsWith("milhoes")) value *= 1000000;
  return value >= 10000 ? value : null;
}

function propertyLine(property: any) {
  return [
    property.code,
    property.title || property.tipo_de_imovel,
    property.descricao ? `Descricao: ${truncate(String(property.descricao), 220)}` : "",
    joinParts([property.bairro, property.cidade, property.uf]),
    property.quartos ? `${property.quartos} quartos` : "",
    property.area_util ? `${property.area_util}m2` : "",
    formatCurrency(property.preco || property.valor_locacao),
  ].filter(Boolean).join(" | ");
}

function propertyLineWithLink(property: PropertyCandidate) {
  const base = propertyLine(property);
  return property.public_url ? `${base} | Link: ${property.public_url}` : base;
}

function formatCurrency(value: any) {
  const number = Number(value || 0);
  if (!number) return "";
  return number.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatDateTimePtBR(date: Date) {
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function line(label: string, value: any) {
  if (value === undefined || value === null || value === "") return "";
  return `${label}: ${value}`;
}

function joinParts(parts: any[]) {
  return parts.filter(Boolean).join(", ");
}

function truncate(value: string, limit: number) {
  if (!value) return "";
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}...`;
}

function splitAssistantMessages(value: string) {
  const cleaned = String(value || "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$2")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  if (!cleaned) return ["Certo, vou seguir por aqui."];

  const chunks = cleaned
    .split(/\n\s*\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .flatMap((chunk) => splitLongMessage(chunk, 900));

  if (chunks.length <= 5) return chunks;
  return [...chunks.slice(0, 4), chunks.slice(4).join("\n\n")];
}

function splitLongMessage(value: string, limit: number) {
  const chunks: string[] = [];
  let rest = value.trim();

  while (rest.length > limit) {
    let cut = Math.max(rest.lastIndexOf(". ", limit), rest.lastIndexOf("! ", limit), rest.lastIndexOf("? ", limit));
    if (cut < limit / 2) cut = rest.lastIndexOf(" ", limit);
    if (cut < limit / 2) cut = limit;
    chunks.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }

  if (rest) chunks.push(rest);
  return chunks;
}

function parseJsonValue(value: any) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizePhone(value: string) {
  return String(value || "").replace(/@.*/, "").replace(/:.*/, "").replace(/\D/g, "");
}

function phoneVariants(value: string) {
  const digits = normalizePhone(value);
  const variants = new Set<string>();
  if (!digits) return [];

  variants.add(digits);
  const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  variants.add(local);
  variants.add(`55${local}`);

  if (local.length === 11 && local[2] === "9") {
    const withoutNinth = `${local.slice(0, 2)}${local.slice(3)}`;
    variants.add(withoutNinth);
    variants.add(`55${withoutNinth}`);
  }

  if (local.length === 10) {
    const withNinth = `${local.slice(0, 2)}9${local.slice(2)}`;
    variants.add(withNinth);
    variants.add(`55${withNinth}`);
  }

  return Array.from(variants).filter(Boolean);
}

function phonesMatch(a: string, b: string) {
  const aVariants = new Set(phoneVariants(a));
  return phoneVariants(b).some((variant) => aVariants.has(variant));
}

function uniqueById(value: PropertyCandidate, index: number, arr: PropertyCandidate[]) {
  return arr.findIndex((item) => item.id === value.id) === index;
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
