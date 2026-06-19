import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { WhatsAppConversation } from "@/hooks/use-whatsapp-conversations";
import { formatPhoneForWhatsApp, isValidWhatsAppPhone } from "@/lib/phone-utils";

interface StartConversationParams {
  phone: string;
  sessionId: string;
  leadId?: string;
  leadName?: string;
}

export class WhatsAppStartError extends Error {
  constructor(message: string, public readonly userMessage = message) {
    super(message);
    this.name = "WhatsAppStartError";
  }
}

function phoneVariantsForMatch(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return [];

  const withoutCountry = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  const local = withoutCountry.startsWith("0") && withoutCountry.length >= 11 ? withoutCountry.slice(1) : withoutCountry;
  const variants = new Set([digits, withoutCountry, local, local ? `55${local}` : ""].filter(Boolean));

  if (local.length === 11 && local[2] === "9") {
    const withoutNinthDigit = `${local.slice(0, 2)}${local.slice(3)}`;
    variants.add(withoutNinthDigit);
    variants.add(`55${withoutNinthDigit}`);
  }

  if (local.length === 10) {
    const withNinthDigit = `${local.slice(0, 2)}9${local.slice(2)}`;
    variants.add(withNinthDigit);
    variants.add(`55${withNinthDigit}`);
  }

  return [...variants];
}

function phonesMatch(a?: string | null, b?: string | null) {
  const aVariants = new Set(phoneVariantsForMatch(a));
  return phoneVariantsForMatch(b).some((variant) => aVariants.has(variant));
}

function conversationMatchesPhone(conversation: Pick<WhatsAppConversation, "contact_phone" | "remote_jid">, phone?: string | null) {
  return phonesMatch(conversation.contact_phone || conversation.remote_jid, phone);
}

export function getWhatsAppStartErrorMessage(error: unknown) {
  if (error instanceof WhatsAppStartError) return error.userMessage;

  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();

  if (normalized.includes("statement timeout") || normalized.includes("timeout")) {
    return "Não foi possível abrir a conversa agora. Tente novamente em alguns instantes.";
  }

  if (normalized.includes("invalid") || normalized.includes("jid") || normalized.includes("phone")) {
    return "Este lead não tem um WhatsApp válido cadastrado.";
  }

  return message || "Ocorreu um erro inesperado ao tentar abrir o chat.";
}

export function useStartConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ phone, sessionId, leadId, leadName }: StartConversationParams): Promise<WhatsAppConversation> => {
      console.log('[WhatsApp Start] useStartConversation iniciado', { phone, sessionId, leadId });
      if (!isValidWhatsAppPhone(phone)) {
        throw new WhatsAppStartError("Telefone inválido para WhatsApp", "Este lead não tem um WhatsApp válido cadastrado.");
      }

      // Always derive organization_id from the WhatsApp session itself (source of truth for RLS)
      const { data: sessionRow, error: sessionError } = await supabase
        .from("whatsapp_sessions")
        .select("id, organization_id")
        .eq("id", sessionId)
        .single();

      if (sessionError || !sessionRow) {
        console.error('[WhatsApp Start] Erro ao buscar sessão:', sessionError);
        throw new Error("Sessão WhatsApp não encontrada ou sem acesso");
      }

      const orgId = sessionRow.organization_id;

      // Formatar o telefone com código do Brasil (+55)
      const cleanPhone = formatPhoneForWhatsApp(phone);
      const remoteJid = cleanPhone.includes("@") ? cleanPhone : `${cleanPhone}@c.us`;

      console.log('[WhatsApp Start] Buscando se já existe conversa local...', { remoteJid, sessionId, orgId, leadId });
      // 1) Verificar se já existe conversa com esse telefone na sessão atual
      const { data: existingConversation, error: searchError } = await supabase
        .from("whatsapp_conversations")
        .select(`
          *,
          session:whatsapp_sessions!whatsapp_conversations_session_id_fkey(id, instance_name, phone_number, status, organization_id),
          lead:leads!whatsapp_conversations_lead_id_fkey(id, name)
        `)
        .eq("session_id", sessionId)
        .eq("remote_jid", remoteJid)
        .is("deleted_at", null)
        .maybeSingle();

      if (searchError) {
        console.error('[WhatsApp Start] Erro na busca de conversa existente:', searchError);
        throw searchError;
      }

      if (existingConversation) {
        console.log('[WhatsApp Start] Conversa encontrada na session atual:', existingConversation.id);
        if (leadId && existingConversation.lead_id !== leadId && conversationMatchesPhone(existingConversation as WhatsAppConversation, cleanPhone)) {
          console.log('[WhatsApp Start] Atualizando lead_id da conversa existente');
          await supabase
            .from("whatsapp_conversations")
            .update({ lead_id: leadId })
            .eq("id", existingConversation.id);
        }
        return existingConversation as WhatsAppConversation;
      }

      // 2) Busca cross-session: a session pode ter mudado por reconexão.
      // Procurar pela organização + lead_id OU remote_jid sem filtrar session.
      console.log('[WhatsApp Start] Não encontrado na session atual, buscando cross-session...');

      // 2a) Por lead_id (mais preciso — identifica o lead independente do número formatado)
      if (leadId) {
        const { data: byLead } = await supabase
          .from("whatsapp_conversations")
          .select(`
            *,
            session:whatsapp_sessions!whatsapp_conversations_session_id_fkey(id, instance_name, phone_number, status, organization_id),
            lead:leads!whatsapp_conversations_lead_id_fkey(id, name)
          `)
          .eq("organization_id", orgId)
          .eq("lead_id", leadId)
          .is("deleted_at", null)
          .order("last_message_received_at", { ascending: false, nullsFirst: false })
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(1);

        if (byLead?.[0]) {
          const leadConversation = (byLead as WhatsAppConversation[]).find((conversation) =>
            conversationMatchesPhone(conversation, cleanPhone),
          );

          if (!leadConversation) {
            console.warn('[WhatsApp Start] Ignorando conversa por lead_id com telefone divergente:', byLead[0].id);
          } else {
            console.log('[WhatsApp Start] Encontrado cross-session por lead_id:', leadConversation.id, '— migrando session...');
            // Migrar para a nova session
            await supabase
              .from("whatsapp_conversations")
              .update({ session_id: sessionId, remote_jid: remoteJid, contact_phone: cleanPhone })
              .eq("id", leadConversation.id);
            return { ...leadConversation, session_id: sessionId, remote_jid: remoteJid } as WhatsAppConversation;
          }
        }
      }

      // 2b) Por remote_jid na organização (fallback quando não temos lead_id)
      const digits = cleanPhone.replace(/\D/g, '');
      const withoutCountry = digits.startsWith('55') && digits.length >= 12 ? digits.substring(2) : digits;
      const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
      const searchVariants = [...new Set([digits, withoutCountry, withCountry])];
      const orFilter = searchVariants
        .flatMap(v => [`remote_jid.ilike.%${v}%`, `contact_phone.ilike.%${v}%`])
        .join(',');

      const { data: byJid } = await supabase
        .from("whatsapp_conversations")
        .select(`
          *,
          session:whatsapp_sessions!whatsapp_conversations_session_id_fkey(id, instance_name, phone_number, status, organization_id),
          lead:leads!whatsapp_conversations_lead_id_fkey(id, name)
        `)
        .eq("organization_id", orgId)
        .or(orFilter)
        .is("deleted_at", null)
        .order("last_message_received_at", { ascending: false, nullsFirst: false })
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1);

      if (byJid?.[0]) {
        console.log('[WhatsApp Start] Encontrado cross-session por remote_jid:', byJid[0].id, '— migrando session...');
        const updateData: any = { session_id: sessionId, remote_jid: remoteJid, contact_phone: cleanPhone };
        if (leadId && !byJid[0].lead_id) updateData.lead_id = leadId;
        await supabase.from("whatsapp_conversations").update(updateData).eq("id", byJid[0].id);
        return { ...byJid[0], ...updateData } as WhatsAppConversation;
      }

      console.log('[WhatsApp Start] Nenhuma conversa encontrada. Inserindo nova...');

      const { data: newConversation, error: insertError } = await supabase
        .from("whatsapp_conversations")
        .insert({
          session_id: sessionId,
          remote_jid: remoteJid,
          contact_phone: cleanPhone,
          contact_name: leadName || cleanPhone,
          lead_id: leadId || null,
          unread_count: 0,
          is_group: false,
          organization_id: orgId,
        })
        .select(`
          *,
          session:whatsapp_sessions!whatsapp_conversations_session_id_fkey(id, instance_name, phone_number, status, organization_id),
          lead:leads!whatsapp_conversations_lead_id_fkey(id, name)
        `)
        .single();

      if (insertError) {
        console.error('[WhatsApp Start] Erro ao inserir nova conversa:', insertError);
        throw insertError;
      }

      console.log('[WhatsApp Start] Nova conversa inserida:', newConversation.id);
      return newConversation as WhatsAppConversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao iniciar conversa",
        description: getWhatsAppStartErrorMessage(error),
        variant: "destructive",
      });
    },
  });
}


export function useFindConversationByPhone() {
  return useMutation({
    mutationFn: async ({ phone, leadId, sessionId }: { phone: string; leadId?: string; sessionId?: string }): Promise<WhatsAppConversation | null> => {
      console.log('[WhatsApp Start] useFindConversationByPhone iniciado', { phone, leadId, sessionId });
      const canSearchByPhone = isValidWhatsAppPhone(phone);

      // 1) Se temos leadId E sessionId, buscar conversa vinculada ao lead NA sessão específica
      if (leadId && sessionId) {
        console.log('[WhatsApp Start] Buscando por leadId + sessionId...');
        const { data: byLeadSession, error: byLeadSessionError } = await supabase
          .from("whatsapp_conversations")
          .select(`
            *,
            session:whatsapp_sessions!whatsapp_conversations_session_id_fkey(id, instance_name, phone_number, status, organization_id),
            lead:leads!whatsapp_conversations_lead_id_fkey(id, name)
          `)
          .eq("lead_id", leadId)
          .eq("session_id", sessionId)
          .is("deleted_at", null)
          .order("last_message_received_at", { ascending: false, nullsFirst: false })
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(1);

        if (byLeadSessionError) {
          console.error('[WhatsApp Start] Erro na busca por leadId+sessionId:', byLeadSessionError);
          throw byLeadSessionError;
        }
        if (byLeadSession?.[0]) {
          const leadConversation = (byLeadSession as WhatsAppConversation[]).find((conversation) =>
            canSearchByPhone && conversationMatchesPhone(conversation, phone),
          );

          if (leadConversation) {
            console.log('[WhatsApp Start] Encontrado por leadId + sessionId:', leadConversation.id);
            return leadConversation as WhatsAppConversation;
          }

          console.warn('[WhatsApp Start] Ignorando conversa por leadId + sessionId com telefone divergente:', byLeadSession[0].id);
        }
      }

      // 2) Se temos leadId (sem sessionId específico), priorizar conversa já vinculada ao lead
      if (leadId && !sessionId) {
        console.log('[WhatsApp Start] Buscando por leadId (sem sessionId)...');
        const { data: byLead, error: byLeadError } = await supabase
          .from("whatsapp_conversations")
          .select(`
            *,
            session:whatsapp_sessions!whatsapp_conversations_session_id_fkey(id, instance_name, phone_number, status, organization_id),
            lead:leads!whatsapp_conversations_lead_id_fkey(id, name)
          `)
          .eq("lead_id", leadId)
          .is("deleted_at", null)
          .order("last_message_received_at", { ascending: false, nullsFirst: false })
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(1);

        if (byLeadError) {
          console.error('[WhatsApp Start] Erro na busca por leadId:', byLeadError);
          throw byLeadError;
        }
        if (byLead?.[0]) {
          const leadConversation = (byLead as WhatsAppConversation[]).find((conversation) =>
            canSearchByPhone && conversationMatchesPhone(conversation, phone),
          );

          if (leadConversation) {
            console.log('[WhatsApp Start] Encontrado por leadId:', leadConversation.id);
            return leadConversation as WhatsAppConversation;
          }

          console.warn('[WhatsApp Start] Ignorando conversa por leadId com telefone divergente:', byLead[0].id);
        }
      }

      // 3) Fallback por telefone - restringir pela sessão se fornecida
      if (!canSearchByPhone) {
        if (leadId) return null;
        throw new WhatsAppStartError("Telefone inválido para WhatsApp", "Este lead não tem um WhatsApp válido cadastrado.");
      }

      const cleanPhone = formatPhoneForWhatsApp(phone);
      console.log('[WhatsApp Start] Buscando por variante de telefone:', cleanPhone);
      
      const digits = cleanPhone.replace(/\D/g, '');
      const withoutCountry = digits.startsWith('55') && digits.length >= 12 
        ? digits.substring(2) 
        : digits;
      const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
      
      const searchVariants = [...new Set([digits, withoutCountry, withCountry])];
      const orFilter = searchVariants
        .flatMap(v => [
          `remote_jid.ilike.%${v}%`,
          `contact_phone.ilike.%${v}%`
        ])
        .join(',');
      
      let query = supabase
        .from("whatsapp_conversations")
        .select(`
          *,
          session:whatsapp_sessions!whatsapp_conversations_session_id_fkey(id, instance_name, phone_number, status, organization_id),
          lead:leads!whatsapp_conversations_lead_id_fkey(id, name)
        `)
        .or(orFilter)
        .is("deleted_at", null)
        .order("last_message_received_at", { ascending: false, nullsFirst: false })
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1);

      // Se temos sessionId, restringir busca à sessão selecionada
      if (sessionId) {
        query = query.eq("session_id", sessionId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[WhatsApp Start] Erro na busca por telefone:', error);
        throw error;
      }
      
      const result = (data?.[0] as WhatsAppConversation) || null;
      console.log('[WhatsApp Start] Resultado da busca por telefone:', result?.id || 'não encontrado');
      return result;
    },
  });
}
