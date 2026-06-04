import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface ScheduleComment {
  id: string;
  event_id: string;
  user_id: string;
  organization_id: string;
  content: string;
  created_at: string;
  user?: {
    id: string;
    name: string;
    avatar_url?: string | null;
  };
}

export function useScheduleComments(eventId: string | undefined) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["schedule_comments", eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await (supabase as any)
        .from("schedule_event_comments")
        .select("id, event_id, user_id, organization_id, content, created_at, user:users(id, name, avatar_url)")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });

      if (error) {
        console.warn("Falling back to bare comments fetch", error);
        const { data: bare } = await (supabase as any)
          .from("schedule_event_comments")
          .select("id, event_id, user_id, organization_id, content, created_at")
          .eq("event_id", eventId)
          .order("created_at", { ascending: true });
        return (bare || []) as ScheduleComment[];
      }
      return (data || []) as ScheduleComment[];
    },
    enabled: !!eventId,
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!user || !eventId) throw new Error("Usuário ou evento não identificado");
      const orgId = profile?.organization_id;
      if (!orgId) throw new Error("Organização não encontrada");

      // Inserir comentário
      const { data, error } = await (supabase as any)
        .from("schedule_event_comments")
        .insert({
          event_id: eventId,
          content,
          user_id: user.id,
          organization_id: orgId,
        })
        .select("id, event_id, user_id, organization_id, content, created_at")
        .single();

      if (error) throw error;

      // Buscar evento + responsáveis para histórico e notificações
      const [{ data: eventData }, { data: assignees }] = await Promise.all([
        (supabase as any)
          .from("schedule_events")
          .select("title, lead_id, user_id, event_type, start_time")
          .eq("id", eventId)
          .maybeSingle(),
        (supabase as any)
          .from("schedule_event_assignees")
          .select("user_id")
          .eq("event_id", eventId),
      ]);

      if (eventData) {
        // Histórico do lead (best-effort)
        if (eventData.lead_id) {
          try {
            await (supabase as any).from("lead_timeline_events").insert({
              lead_id: eventData.lead_id,
              organization_id: orgId,
              user_id: user.id,
              event_type: "schedule_comment",
              title: "Comentário em atividade",
              description: `Comentário em "${eventData.title}": ${content}`,
              metadata: { schedule_event_id: eventId },
            });
          } catch (e) {
            console.warn("timeline insert failed", e);
          }
        }

        // Notificar responsáveis (assignees + user_id principal), exceto autor
        const recipientIds = new Set<string>();
        (assignees || []).forEach((a: any) => a?.user_id && recipientIds.add(a.user_id));
        if (eventData.user_id) recipientIds.add(eventData.user_id);
        recipientIds.delete(user.id);

        if (recipientIds.size > 0) {
          const rows = Array.from(recipientIds).map((uid) => ({
            user_id: uid,
            organization_id: orgId,
            type: "schedule_comment",
            title: "Novo comentário em tarefa",
            content: `Comentário em "${eventData.title}": ${content.slice(0, 120)}`,
          }));
          // Fire-and-forget notifications
          supabase.from("notifications").insert(rows).then(({ error: e }) => {
            if (e) console.warn("notifications insert failed", e);
          });
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule_comments", eventId] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao adicionar comentário",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    comments,
    isLoading,
    addComment: addCommentMutation.mutate,
    isAdding: addCommentMutation.isPending,
  };
}
