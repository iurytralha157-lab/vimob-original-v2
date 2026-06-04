import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { callEvolutionGo } from "./use-evolution-go";

export interface WhatsAppLabel {
  id: string;
  session_id: string;
  organization_id: string;
  remote_label_id: string;
  name: string;
  color: number | null;
  predefined: boolean;
  created_at: string;
}

export function useWhatsAppLabels(sessionId?: string) {
  return useQuery({
    queryKey: ["whatsapp-labels", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_labels")
        .select("*")
        .eq("session_id", sessionId!)
        .order("name");
      if (error) throw error;
      return (data || []) as WhatsAppLabel[];
    },
  });
}

export function useChatLabels(conversationId?: string) {
  return useQuery({
    queryKey: ["whatsapp-chat-labels", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_chat_labels")
        .select("label_id, whatsapp_labels(*)")
        .eq("conversation_id", conversationId!);
      if (error) throw error;
      return (data || []).map((r: any) => r.whatsapp_labels as WhatsAppLabel).filter(Boolean);
    },
  });
}

export function useSyncLabels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { data: session, error: sessionError } = await supabase
        .from("whatsapp_sessions")
        .select("id, organization_id")
        .eq("id", sessionId)
        .single();
      if (sessionError) throw sessionError;

      const r = await callEvolutionGo("label.list", { session_id: sessionId });
      if (!r.ok) throw new Error(r.error || "Falha ao sincronizar etiquetas");

      const rawLabels =
        Array.isArray(r.data) ? r.data :
        Array.isArray(r.data?.data) ? r.data.data :
        Array.isArray(r.data?.labels) ? r.data.labels :
        Array.isArray(r.data?.data?.labels) ? r.data.data.labels :
        [];

      const labels = rawLabels
        .map((label: any) => ({
          session_id: sessionId,
          organization_id: session.organization_id,
          remote_label_id: String(label.id ?? label.ID ?? label.labelId ?? label.LabelID ?? ""),
          name: String(label.name ?? label.Name ?? label.label ?? label.Label ?? "Etiqueta"),
          color: label.color ?? label.Color ?? label.colorIndex ?? label.ColorIndex ?? null,
          predefined: Boolean(label.predefined ?? label.Predefined ?? false),
        }))
        .filter((label: any) => label.remote_label_id);

      if (labels.length > 0) {
        const { error } = await supabase
          .from("whatsapp_labels")
          .upsert(labels, { onConflict: "session_id,remote_label_id" });
        if (error) throw error;
      }

      return { raw: r.data, synced: labels.length };
    },
    onSuccess: (_d, sessionId) => qc.invalidateQueries({ queryKey: ["whatsapp-labels", sessionId] }),
  });
}

export function useAssignLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      sessionId: string;
      remoteJid: string;
      labelId: string;
      conversationId: string;
      add: boolean;
    }) => {
      const action = args.add ? "label.addChat" : "label.removeChat";
      const { data: labelRow } = await supabase
        .from("whatsapp_labels")
        .select("id, remote_label_id")
        .eq("session_id", args.sessionId)
        .or(`id.eq.${args.labelId},remote_label_id.eq.${args.labelId}`)
        .maybeSingle();

      const dbLabelId = labelRow?.id || args.labelId;
      const remoteLabelId = labelRow?.remote_label_id || args.labelId;
      const r = await callEvolutionGo(action, {
        session_id: args.sessionId,
        body: { labelId: remoteLabelId, jid: args.remoteJid },
      });
      if (!r.ok) throw new Error(r.error || "Falha ao alterar etiqueta");

      // optimistic mirror in chat_labels
      if (args.add) {
        await supabase.from("whatsapp_chat_labels").upsert({
          conversation_id: args.conversationId,
          label_id: dbLabelId,
        }, { onConflict: "conversation_id,label_id" });
      } else {
        await supabase.from("whatsapp_chat_labels")
          .delete()
          .eq("conversation_id", args.conversationId)
          .eq("label_id", dbLabelId);
      }
      return r.data;
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ["whatsapp-chat-labels", vars.conversationId] }),
  });
}
