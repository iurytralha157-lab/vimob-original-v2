import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface AIAgent {
  id: string;
  organization_id: string;
  session_id: string | null;
  name: string;
  is_active: boolean;
  ai_provider: string;
  system_prompt: string | null;
  handoff_keywords: string[] | null;
  max_messages_before_handoff: number;
  created_at: string;
  updated_at: string;
}

export interface AIAgentConversation {
  id: string;
  agent_id: string;
  conversation_id: string;
  lead_id: string | null;
  status: string;
  message_count: number;
  started_at: string;
  handed_off_at: string | null;
}

export function useAIAgents() {
  const { profile } = useAuth();
  const organizationId = profile?.organization_id;

  return useQuery({
    queryKey: ["ai-agents", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agents" as any)
        .select("*")
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as AIAgent[];
    },
    enabled: !!organizationId,
  });
}

export function useAIAgentConversations(agentId?: string) {
  return useQuery({
    queryKey: ["ai-agent-conversations", agentId],
    queryFn: async () => {
      let query = supabase
        .from("ai_agent_conversations" as any)
        .select("*")
        .order("started_at", { ascending: false })
        .limit(50);

      if (agentId) {
        query = query.eq("agent_id", agentId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as AIAgentConversation[];
    },
    enabled: true,
  });
}

export function useCreateAIAgent() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: Partial<AIAgent>) => {
      const { data, error } = await supabase
        .from("ai_agents" as any)
        .insert({
          ...input,
          organization_id: profile?.organization_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as unknown as AIAgent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
      toast.success("Agente criado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(`Erro ao criar agente: ${error.message}`);
    },
  });
}

export function useUpdateAIAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AIAgent> & { id: string }) => {
      const { data, error } = await supabase
        .from("ai_agents" as any)
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as AIAgent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
      toast.success("Agente atualizado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(`Erro ao atualizar agente: ${error.message}`);
    },
  });
}

export function useDeleteAIAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ai_agents" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
      toast.success("Agente removido.");
    },
    onError: (error: any) => {
      toast.error(`Erro ao remover agente: ${error.message}`);
    },
  });
}
