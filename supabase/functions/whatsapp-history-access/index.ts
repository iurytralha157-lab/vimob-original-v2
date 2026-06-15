import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(value: string | null | undefined) {
  if (!value) return "";
  let cleaned = value.replace(/\D/g, "");
  if (cleaned.startsWith("55") && cleaned.length >= 12) cleaned = cleaned.slice(2);
  while (cleaned.startsWith("0") && cleaned.length > 10) cleaned = cleaned.slice(1);
  return cleaned;
}

function phoneVariants(value: string | null | undefined) {
  const cleaned = (value || "").replace(/\D/g, "");
  const normalized = normalizePhone(value);
  const withoutTrunk = cleaned.replace(/^55/, "").replace(/^0+/, "");
  const baseVariants = [
    cleaned,
    normalized,
    normalized ? `55${normalized}` : "",
    withoutTrunk,
    withoutTrunk ? `55${withoutTrunk}` : "",
  ].filter(Boolean);

  const brMobileVariants: string[] = [];
  for (const phone of baseVariants) {
    const local = normalizePhone(phone);
    if (local.length === 11 && local[2] === "9") {
      const withoutNinthDigit = `${local.slice(0, 2)}${local.slice(3)}`;
      brMobileVariants.push(withoutNinthDigit, `55${withoutNinthDigit}`);
    }
    if (local.length === 10) {
      const withNinthDigit = `${local.slice(0, 2)}9${local.slice(2)}`;
      brMobileVariants.push(withNinthDigit, `55${withNinthDigit}`);
    }
  }

  return [...new Set([...baseVariants, ...brMobileVariants])];
}

function phoneMatchesVariants(value: string | null | undefined, variants: string[]) {
  if (!variants.length) return false;
  const valueVariants = new Set(phoneVariants(value));
  return variants.some((variant) => valueVariants.has(variant));
}

function conversationMatchesVariants(conversation: any, variants: string[]) {
  return phoneMatchesVariants(conversation?.contact_phone || conversation?.remote_jid, variants);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const leadId = typeof body?.leadId === "string" ? body.leadId : null;
    const conversationId = typeof body?.conversationId === "string" ? body.conversationId : null;
    // New: if true, return ALL messages from ALL conversations for this lead
    const allMessages = body?.allMessages === true;

    if (!leadId && !conversationId) {
      return new Response(JSON.stringify({ error: "leadId or conversationId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get requester profile
    const { data: requester, error: requesterError } = await supabase
      .from("users")
      .select("id, role, organization_id")
      .eq("id", user.id)
      .single();

    if (requesterError || !requester) {
      return new Response(JSON.stringify({ error: "User profile not found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== ALL MESSAGES MODE: return every message across all conversations for a lead =====
    if (allMessages && leadId) {
      // Check access
      let canView = requester.role === "admin" || requester.role === "super_admin";

      if (!canView) {
        const [{ data: canAccessLead }, { data: canViewAll }] = await Promise.all([
          supabase.rpc("can_access_lead", { p_lead_id: leadId, p_user_id: user.id }),
          supabase.rpc("user_has_permission", { p_permission_key: "lead_view_all", p_user_id: user.id }),
        ]);

        if (canAccessLead) {
          canView = true;
        } else if (canViewAll) {
          const { data: leadRow } = await supabase
            .from("leads")
            .select("organization_id")
            .eq("id", leadId)
            .maybeSingle();
          canView = leadRow?.organization_id === requester.organization_id;
        }
      }

      if (!canView) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: leadRow, error: leadError } = await supabase
        .from("leads")
        .select("id, phone, organization_id")
        .eq("id", leadId)
        .maybeSingle();

      if (leadError) throw leadError;

      const variants = phoneVariants(leadRow?.phone);

      // Get conversations tied to this lead only when the phone still matches.
      const { data: linkedConversations, error: convError } = await supabase
        .from("whatsapp_conversations")
        .select("id, session_id, contact_phone, remote_jid")
        .eq("lead_id", leadId);

      if (convError) throw convError;
      let conversations = (linkedConversations || []).filter((conversation: any) =>
        conversationMatchesVariants(conversation, variants)
      );

      if (leadRow?.organization_id && variants.length > 0) {
        const jidVariants = [
          ...variants.map((phone) => `${phone}@s.whatsapp.net`),
          ...variants.map((phone) => `${phone}@c.us`),
        ];

        const { data: phoneConversations, error: phoneConvError } = await supabase
          .from("whatsapp_conversations")
          .select("id, session_id, contact_phone, remote_jid")
          .eq("organization_id", leadRow.organization_id)
          .eq("is_group", false)
          .in("contact_phone", variants);

        const { data: remoteConversations, error: remoteConvError } = await supabase
          .from("whatsapp_conversations")
          .select("id, session_id, contact_phone, remote_jid")
          .eq("organization_id", leadRow.organization_id)
          .eq("is_group", false)
          .in("remote_jid", jidVariants);

        if (phoneConvError) throw phoneConvError;
        if (remoteConvError) throw remoteConvError;
        conversations = [
          ...conversations,
          ...[...(phoneConversations || []), ...(remoteConversations || [])].filter((conversation: any) => {
            return conversationMatchesVariants(conversation, variants);
          }),
        ];
      }

      conversations = [...new Map(conversations.map((conversation: any) => [conversation.id, conversation])).values()];

      if (!conversations || conversations.length === 0) {
        return new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const conversationIds = conversations.map((c: any) => c.id);

      const messageSelect =
        "id, content, from_me, message_type, media_url, media_mime_type, media_status, media_error, media_size, media_storage_path, sent_at, delivered_at, read_at, status, sender_name, sender_jid, conversation_id, session_id, message_id, client_message_id, remote_jid, reaction_to_message_id, reaction_emoji, reaction_sender_jid, reaction_sender_name, metadata";
      const pageSize = 1000;
      const maxMessages = 10000;
      const fetchedMessages: any[] = [];

      for (let offset = 0; offset < maxMessages; offset += pageSize) {
        const pageResult = await supabase
          .from("whatsapp_messages")
          .select(messageSelect)
          .in("conversation_id", conversationIds)
          .order("sent_at", { ascending: false })
          .range(offset, offset + pageSize - 1);

        if (pageResult.error) throw pageResult.error;

        const page = pageResult.data || [];
        fetchedMessages.push(...page);

        if (page.length < pageSize) break;
      }

      const messagesTruncated = fetchedMessages.length >= maxMessages;

      // Collect ALL session_ids from both conversations AND messages
      const allSessionIds = [...new Set([
        ...conversations.map((c: any) => c.session_id),
        ...fetchedMessages.map((m: any) => m.session_id).filter(Boolean),
      ])];

      // Get sessions
      let sessionMap: Record<string, any> = {};
      if (allSessionIds.length > 0) {
        const { data: sessions } = await supabase
          .from("whatsapp_sessions")
          .select("id, instance_name, owner_user_id")
          .in("id", allSessionIds);

        if (sessions) {
          sessionMap = Object.fromEntries(sessions.map((s: any) => [s.id, s]));
        }
      }

      // Get owner names
      const ownerIds = [...new Set(
        Object.values(sessionMap)
          .map((s: any) => s.owner_user_id)
          .filter(Boolean)
      )];

      let ownerMap: Record<string, string> = {};
      if (ownerIds.length > 0) {
        const { data: owners } = await supabase
          .from("users")
          .select("id, name")
          .in("id", ownerIds);
        if (owners) {
          ownerMap = Object.fromEntries(owners.map((o: any) => [o.id, o.name]));
        }
      }

      // Enrich messages
      const enriched = fetchedMessages.map((msg: any) => {
        const session = sessionMap[msg.session_id];
        return {
          ...msg,
          session_owner_name: session?.owner_user_id ? (ownerMap[session.owner_user_id] || null) : null,
          session_instance_name: session?.instance_name || null,
        };
      });

      // Re-sort ascending for display (we fetched desc to get the most recent 1000)
      const messages = enriched.sort((a: any, b: any) => 
        new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
      );

      return new Response(JSON.stringify({
        messages,
        conversations_count: conversations.length,
        messages_count: messages.length,
        truncated: messagesTruncated,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== SINGLE CONVERSATION MODE (original behavior) =====
    let conversation: any = null;

    if (conversationId) {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select(`
          *,
          session:whatsapp_sessions!whatsapp_conversations_session_id_fkey(id, instance_name, phone_number, status, organization_id),
          lead:leads!whatsapp_conversations_lead_id_fkey(
            id,
            name,
            pipeline_id,
            stage_id,
            pipeline:pipelines(id, name),
            stage:stages(id, name, color),
            tags:lead_tags(tag:tags(id, name, color))
          )
        `)
        .eq("id", conversationId)
        .maybeSingle();

      if (error) throw error;
      conversation = data;
    }

    let leadPhoneVariants: string[] = [];
    let leadOrganizationId: string | null = null;

    if (!conversation && leadId) {
      const { data: leadRowForConversation, error: leadLookupError } = await supabase
        .from("leads")
        .select("id, phone, organization_id")
        .eq("id", leadId)
        .maybeSingle();

      if (leadLookupError) throw leadLookupError;
      leadPhoneVariants = phoneVariants(leadRowForConversation?.phone);
      leadOrganizationId = leadRowForConversation?.organization_id || null;

      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select(`
          *,
          session:whatsapp_sessions!whatsapp_conversations_session_id_fkey(id, instance_name, phone_number, status, organization_id),
          lead:leads!whatsapp_conversations_lead_id_fkey(
            id,
            name,
            pipeline_id,
            stage_id,
            pipeline:pipelines(id, name),
            stage:stages(id, name, color),
            tags:lead_tags(tag:tags(id, name, color))
          )
        `)
        .eq("lead_id", leadId)
        .is("deleted_at", null)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1);

      if (error) throw error;
      conversation = (data || []).find((candidate: any) =>
        conversationMatchesVariants(candidate, leadPhoneVariants)
      ) || null;
    }

    if (!conversation && leadId && leadOrganizationId && leadPhoneVariants.length > 0) {
      const jidVariants = [
        ...leadPhoneVariants.map((phone) => `${phone}@s.whatsapp.net`),
        ...leadPhoneVariants.map((phone) => `${phone}@c.us`),
      ];

      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select(`
          *,
          session:whatsapp_sessions!whatsapp_conversations_session_id_fkey(id, instance_name, phone_number, status, organization_id),
          lead:leads!whatsapp_conversations_lead_id_fkey(
            id,
            name,
            pipeline_id,
            stage_id,
            pipeline:pipelines(id, name),
            stage:stages(id, name, color),
            tags:lead_tags(tag:tags(id, name, color))
          )
        `)
        .eq("organization_id", leadOrganizationId)
        .eq("is_group", false)
        .is("deleted_at", null)
        .or(`contact_phone.in.(${leadPhoneVariants.join(",")}),remote_jid.in.(${jidVariants.join(",")})`)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(10);

      if (error) throw error;
      conversation = (data || []).find((candidate: any) =>
        conversationMatchesVariants(candidate, leadPhoneVariants)
      ) || null;
    }

    if (!conversation) {
      return new Response(JSON.stringify({ conversation: null, messages: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resolvedLeadId = conversation.lead_id || leadId;
    let canView = requester.role === "admin" || requester.role === "super_admin";

    if (!canView && resolvedLeadId) {
      const [{ data: canAccessLead }, { data: canViewAll }] = await Promise.all([
        supabase.rpc("can_access_lead", { p_lead_id: resolvedLeadId, p_user_id: user.id }),
        supabase.rpc("user_has_permission", { p_permission_key: "lead_view_all", p_user_id: user.id }),
      ]);

      if (canAccessLead) {
        canView = true;
      } else if (canViewAll) {
        const { data: leadRow } = await supabase
          .from("leads")
          .select("organization_id")
          .eq("id", resolvedLeadId)
          .maybeSingle();

        canView = leadRow?.organization_id === requester.organization_id;
      }
    }

    if (!canView) {
      const { data: canAccessSession } = await supabase.rpc("can_access_whatsapp_session", {
        p_session_id: conversation.session_id,
        p_user_id: user.id,
      });
      canView = !!canAccessSession;
    }

    if (!canView) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: messages, error: messagesError } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("conversation_id", conversation.id)
      .order("sent_at", { ascending: true });

    if (messagesError) throw messagesError;

    return new Response(JSON.stringify({ conversation, messages: messages || [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
