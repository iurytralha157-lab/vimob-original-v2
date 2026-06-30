import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { callEvolutionGo } from "./use-evolution-go";

/** Check if a list of phone numbers have WhatsApp */
export function useCheckWhatsAppNumber() {
  return useMutation({
    mutationFn: async (args: { sessionId: string; numbers: string[] }) => {
      const r = await callEvolutionGo("user.check", {
        session_id: args.sessionId,
        body: { numbers: args.numbers },
      });
      if (!r.ok) throw new Error(r.error || "Falha ao verificar números");
      return r.data;
    },
  });
}

/** Fetch avatar URL for a single JID */
export function useFetchAvatar() {
  return useMutation({
    mutationFn: async (args: { sessionId: string; jid: string }) => {
      const r = await callEvolutionGo("user.avatar", {
        session_id: args.sessionId,
        body: { jid: args.jid },
      });
      if (!r.ok) throw new Error(r.error || "Falha");
      return r.data;
    },
  });
}

/** Trigger bulk avatar sync via edge function (for current organization) */
export function useSyncContactsAvatars() {
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { data, error } = await supabase.functions.invoke("sync-whatsapp-contacts", {
        body: { session_id: sessionId, limit: 40, max_avatar_fetches: 2 },
      });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

/** Trigger history sync for an Evolution Go session */
export function useHistorySync() {
  return useMutation({
    mutationFn: async (args: { sessionId: string; jid?: string }) => {
      const r = await callEvolutionGo("chat.historySync", {
        session_id: args.sessionId,
        body: args.jid ? { jid: args.jid } : {},
      });
      if (!r.ok) throw new Error(r.error || "Falha ao sincronizar histórico");
      return r.data;
    },
  });
}
