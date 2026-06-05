import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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

const eventLabels: Record<string, string> = {
  call: "Ligação",
  email: "E-mail",
  meeting: "Reunião",
  task: "Tarefa",
  message: "Mensagem",
  visit: "Visita",
};

async function attachUsersToComments(comments: ScheduleComment[]) {
  const userIds = Array.from(new Set(comments.map((comment) => comment.user_id).filter(Boolean)));
  if (userIds.length === 0) return comments;

  const { data: users } = await (supabase as any)
    .from("users")
    .select("id, name, avatar_url")
    .in("id", userIds);

  const usersById = new Map((users || []).map((item: any) => [item.id, item]));

  return comments.map((comment) => ({
    ...comment,
    user: comment.user || usersById.get(comment.user_id),
  }));
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
        return attachUsersToComments((bare || []) as ScheduleComment[]);
      }
      return attachUsersToComments((data || []) as ScheduleComment[]);
    },
    enabled: !!eventId,
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!user || !eventId) throw new Error("Usuário ou evento não identificado");
      const orgId = profile?.organization_id;
      if (!orgId) throw new Error("Organização não encontrada");

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
        const actorName = profile?.name || user.email || "Usuário";
        const eventLabel = eventLabels[eventData.event_type || "task"] || "Atividade";
        const formattedDate = format(new Date(eventData.start_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
        const notificationText = `${actorName} deixou um comentário na "${eventLabel}" de ${formattedDate}.`;

        if (eventData.lead_id) {
          try {
            await (supabase as any).from("lead_timeline_events").insert({
              lead_id: eventData.lead_id,
              organization_id: orgId,
              user_id: user.id,
              event_type: "schedule_comment",
              title: "Comentário em atividade",
              description: `${notificationText} ${content}`,
              metadata: { schedule_event_id: eventId },
            });
          } catch (e) {
            console.warn("timeline insert failed", e);
          }
        }

        const recipientIds = new Set<string>();
        (assignees || []).forEach((a: any) => a?.user_id && recipientIds.add(a.user_id));
        if (eventData.user_id) recipientIds.add(eventData.user_id);
        recipientIds.delete(user.id);

        if (recipientIds.size > 0) {
          const rows = Array.from(recipientIds).map((uid) => ({
            user_id: uid,
            organization_id: orgId,
            type: "schedule_comment",
            title: "Comentário em atividade",
            content: notificationText,
            metadata: {
              schedule_event_id: eventId,
              event_type: eventData.event_type,
              comment_preview: content.slice(0, 160),
            },
          }));

          supabase.from("notifications").insert(rows as any).then(({ error: notifyError }) => {
            if (notifyError) console.warn("notifications insert failed", notifyError);
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
