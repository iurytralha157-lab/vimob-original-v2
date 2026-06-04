import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { callEvolutionGo } from "./use-evolution-go";

export interface WhatsAppGroup {
  id: string;
  session_id: string;
  organization_id: string;
  group_jid: string;
  subject: string | null;
  description: string | null;
  picture_url: string | null;
  participants: any[];
  owner_jid: string | null;
  is_announce: boolean;
  updated_at: string;
}

export function useWhatsAppGroups(sessionId?: string) {
  return useQuery({
    queryKey: ["whatsapp-groups", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_groups")
        .select("*")
        .eq("session_id", sessionId!)
        .order("subject");
      if (error) throw error;
      return (data || []) as WhatsAppGroup[];
    },
  });
}

export function useSyncGroups() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const r = await callEvolutionGo("group.myAll", { session_id: sessionId });
      if (!r.ok) throw new Error(r.error || "Falha ao sincronizar grupos");
      return r.data;
    },
    onSuccess: (_d, sessionId) => qc.invalidateQueries({ queryKey: ["whatsapp-groups", sessionId] }),
  });
}

export function useGroupInfo() {
  return useMutation({
    mutationFn: async (args: { sessionId: string; jid: string }) => {
      const r = await callEvolutionGo("group.info", {
        session_id: args.sessionId,
        body: { jid: args.jid },
      });
      if (!r.ok) throw new Error(r.error || "Falha ao buscar grupo");
      return r.data;
    },
  });
}

export function useGroupInviteLink() {
  return useMutation({
    mutationFn: async (args: { sessionId: string; jid: string }) => {
      const r = await callEvolutionGo("group.inviteLink", {
        session_id: args.sessionId,
        body: { jid: args.jid },
      });
      if (!r.ok) throw new Error(r.error || "Falha");
      return r.data;
    },
  });
}

export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      sessionId: string;
      jid: string;
      field: "name" | "description" | "photo";
      value: string;
    }) => {
      const map = { name: "group.setName", description: "group.setDescription", photo: "group.setPhoto" } as const;
      const r = await callEvolutionGo(map[args.field], {
        session_id: args.sessionId,
        body: { jid: args.jid, value: args.value },
      });
      if (!r.ok) throw new Error(r.error || "Falha ao atualizar grupo");
      return r.data;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["whatsapp-groups", vars.sessionId] }),
  });
}
