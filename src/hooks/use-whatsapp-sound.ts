import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Plays a short "plop" sound apenas quando uma mensagem nova chega
 * em uma conversa que o usuário tem acesso.
 *
 * Regras de acesso:
 * - Dono da sessão → ouve tudo
 * - access_mode = "assigned_leads_only" → só ouve se o lead está atribuído a ele
 * - access_mode = "team_leads" → ouve leads da equipe
 * - access_mode = "all_leads" ou "full_inbox" → ouve tudo da sessão
 *
 * Throttled a 1.5s para evitar spam de som.
 */
export function useWhatsAppSound() {
  const { user, organization } = useAuth();
  const lastPlayedRef = useRef<number>(0);
  const notifyAfterRef = useRef<number>(Date.now());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Guarda as conversas que o usuário tem acesso
  const accessibleConversationJids = useRef<Set<string>>(new Set());
  const ownedSessionIds = useRef<Set<string>>(new Set());
  const fullAccessSessionIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id || !organization?.id) return;
    notifyAfterRef.current = Date.now();

    // Lazy-load audio
    const a = new Audio("/sounds/whatsapp-pop.mp3");
    a.volume = 0.4;
    a.preload = "auto";
    audioRef.current = a;

    // 1. Buscar sessões que o usuário é dono
    const loadOwnedSessions = async () => {
      const { data } = await supabase
        .from("whatsapp_sessions")
        .select("id")
        .eq("organization_id", organization.id)
        .eq("owner_user_id", user.id)
        .eq("is_active", true);

      ownedSessionIds.current = new Set((data || []).map((s: any) => s.id));
    };

    // 2. Buscar sessões com acesso explícito e o modo de acesso
    const loadAccessGrants = async () => {
      const { data: grants } = await supabase
        .from("whatsapp_session_access")
        .select(
          `
          session_id,
          access_mode,
          can_view,
          session:whatsapp_sessions!whatsapp_session_access_session_id_fkey(
            organization_id
          )
        `,
        )
        .eq("user_id", user.id)
        .eq("can_view", true);

      const filtered = (grants || []).filter((g: any) => g.session?.organization_id === organization.id);

      // Sessões com acesso total (all_leads ou full_inbox)
      const fullAccess = filtered
        .filter((g: any) => g.access_mode === "all_leads" || g.access_mode === "full_inbox")
        .map((g: any) => g.session_id);

      fullAccessSessionIds.current = new Set(fullAccess);

      // Para assigned_leads_only e team_leads, buscar as conversas específicas
      const restrictedGrants = filtered.filter(
        (g: any) => g.access_mode === "assigned_leads_only" || g.access_mode === "team_leads",
      );

      if (restrictedGrants.length > 0) {
        await loadAccessibleConversations(restrictedGrants);
      }
    };

    // 3. Buscar conversas acessíveis baseado no modo de acesso
    const loadAccessibleConversations = async (grants: any[]) => {
      const assignedOnlySessionIds = grants
        .filter((g: any) => g.access_mode === "assigned_leads_only")
        .map((g: any) => g.session_id);

      const teamSessionIds = grants.filter((g: any) => g.access_mode === "team_leads").map((g: any) => g.session_id);

      const jids = new Set<string>();

      // Conversas de leads atribuídos ao usuário
      if (assignedOnlySessionIds.length > 0) {
        const { data: conversations } = await supabase
          .from("whatsapp_conversations")
          .select("remote_jid, lead:leads!whatsapp_conversations_lead_id_fkey(assigned_user_id)")
          .in("session_id", assignedOnlySessionIds)
          .not("deleted_at", "is", null);

        (conversations || []).forEach((conv: any) => {
          if (conv.lead?.assigned_user_id === user.id) {
            jids.add(conv.remote_jid);
          }
        });
      }

      // Conversas de leads da equipe
      if (teamSessionIds.length > 0) {
        // Buscar membros da equipe do usuário
        const { data: teamMembers } = await supabase
          .from("team_members")
          .select("team:teams!team_members_team_id_fkey(id), user_id")
          .eq("user_id", user.id);

        const teamIds = (teamMembers || []).map((m: any) => m.team?.id).filter(Boolean);

        if (teamIds.length > 0) {
          const { data: teamUserIds } = await supabase.from("team_members").select("user_id").in("team_id", teamIds);

          const memberIds = (teamUserIds || []).map((m: any) => m.user_id);

          const { data: conversations } = await supabase
            .from("whatsapp_conversations")
            .select("remote_jid, lead:leads!whatsapp_conversations_lead_id_fkey(assigned_user_id)")
            .in("session_id", teamSessionIds)
            .is("deleted_at", null);

          (conversations || []).forEach((conv: any) => {
            if (memberIds.includes(conv.lead?.assigned_user_id)) {
              jids.add(conv.remote_jid);
            }
          });
        }
      }

      accessibleConversationJids.current = jids;
    };

    // Carregar dados de acesso
    const loadAccessData = async () => {
      await Promise.all([loadOwnedSessions(), loadAccessGrants()]);
    };

    loadAccessData();

    // Verificar se o usuário pode ouvir o som de uma mensagem
    const canHearMessage = async (message: any): Promise<boolean> => {
      const sessionId = message.session_id;
      const conversationId = message.conversation_id;

      // Dono da sessão → ouve tudo
      if (ownedSessionIds.current.has(sessionId)) return true;

      // Acesso total à sessão → ouve tudo
      if (fullAccessSessionIds.current.has(sessionId)) return true;

      // Verificar se a conversa específica está na lista de acessíveis
      if (conversationId) {
        const { data: conv } = await supabase
          .from("whatsapp_conversations")
          .select("remote_jid")
          .eq("id", conversationId)
          .single();

        if (conv && accessibleConversationJids.current.has(conv.remote_jid)) {
          return true;
        }
      }

      return false;
    };

    const isFreshRealtimeInsert = (createdAt?: string | null) => {
      if (!createdAt) return true;
      const createdTime = Date.parse(createdAt);
      if (Number.isNaN(createdTime)) return true;
      return createdTime >= notifyAfterRef.current - 5000;
    };

    // ✅ Listener de mensagens — agora filtra pelo acesso do usuário
    const channel = supabase
      .channel(`whatsapp-sound-${user.id}-${organization.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_messages",
        },
        async (payload) => {
          const m = payload.new as any;

          // Ignorar mensagens enviadas pelo usuário
          if (!m || m.from_me) return;

          // Ignorar mensagens antigas entregues em lote após login/reconexão
          if (!isFreshRealtimeInsert(m.created_at)) return;

          // Verificar se o usuário tem acesso a essa conversa
          const hasAccess = await canHearMessage(m);
          if (!hasAccess) return;

          // Throttle de 1.5s
          const now = Date.now();
          if (now - lastPlayedRef.current < 1500) return;
          lastPlayedRef.current = now;

          audioRef.current?.play().catch(() => {});
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          notifyAfterRef.current = Date.now();
        }
      });

    // Recarregar acesso periodicamente (a cada 2 minutos)
    const refreshInterval = setInterval(loadAccessData, 2 * 60 * 1000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(refreshInterval);
      audioRef.current = null;
    };
  }, [user?.id, organization?.id]);
}
