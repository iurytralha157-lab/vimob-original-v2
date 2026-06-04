import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface AssigneeUser {
  id: string;
  name: string;
  avatar_url: string | null;
}

export function useScheduleEventAssignees(eventId: string | undefined) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const { data: assignees = [], isLoading } = useQuery({
    queryKey: ["schedule_assignees", eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await (supabase as any)
        .from("schedule_event_assignees")
        .select("user_id, user:users!schedule_event_assignees_user_id_fkey(id, name, avatar_url)")
        .eq("event_id", eventId);
      if (error) return [];
      return (data || []).map((r: any) => r.user).filter(Boolean) as AssigneeUser[];
    },
    enabled: !!eventId,
  });

  const addAssignee = useMutation({
    mutationFn: async (userId: string) => {
      if (!eventId || !profile?.organization_id) throw new Error("Dados insuficientes");
      const { error } = await (supabase as any)
        .from("schedule_event_assignees")
        .insert({
          event_id: eventId,
          user_id: userId,
          organization_id: profile.organization_id,
        });
      if (error && !error.message?.includes("duplicate")) throw error;

      // Notificar novo responsável
      try {
        const { data: ev } = await (supabase as any)
          .from("schedule_events")
          .select("title")
          .eq("id", eventId)
          .maybeSingle();
        if (ev && userId !== profile.id) {
          await (supabase as any).from("notifications").insert({
            user_id: userId,
            organization_id: profile.organization_id,
            type: "schedule_assigned",
            title: "Você foi adicionado a uma atividade",
            content: ev.title,
          });
        }
      } catch {
        // noop
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule_assignees", eventId] });
    },
  });

  const removeAssignee = useMutation({
    mutationFn: async (userId: string) => {
      if (!eventId) return;
      const { error } = await (supabase as any)
        .from("schedule_event_assignees")
        .delete()
        .eq("event_id", eventId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule_assignees", eventId] });
    },
  });

  return {
    assignees,
    isLoading,
    addAssignee: addAssignee.mutate,
    removeAssignee: removeAssignee.mutate,
  };
}
