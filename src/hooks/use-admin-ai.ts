import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AIGlobalAgent {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  provider: string;
  default_model: string;
  fallback_model: string;
  system_prompt: string;
  safety_prompt: string;
  is_active: boolean;
  temperature: number;
  max_output_tokens: number;
  max_context_messages: number;
  monthly_token_budget: number;
  daily_token_budget: number;
  lgpd_mode: string;
}

export interface AIOrganizationSetting {
  id: string;
  organization_id: string;
  agent_id: string;
  is_enabled: boolean;
  mode: "off" | "preview" | "assist" | "auto";
  allowed_contexts: string[];
  organization_prompt: string;
  business_rules: string;
  handoff_keywords: string[];
  require_human_approval: boolean;
  daily_token_budget: number;
  monthly_token_budget: number;
  max_output_tokens: number;
  max_context_messages: number;
  pii_redaction_enabled: boolean;
  store_ai_outputs: boolean;
}

export interface AIInteractionLog {
  id: string;
  organization_id: string | null;
  event_type: string;
  mode: string;
  model: string | null;
  total_tokens: number;
  estimated_cost_usd: number;
  latency_ms: number | null;
  success: boolean;
  input_preview: string | null;
  output_preview: string | null;
  created_at: string;
}

export interface AdminAIOverview {
  totalInteractions: number;
  totalTokens: number;
  estimatedCost: number;
  avgLatencyMs: number;
  successRate: number;
}

export function useJennyAgent() {
  return useQuery({
    queryKey: ["admin-ai-jenny"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_global_agents" as any)
        .select("*")
        .eq("slug", "jenny")
        .maybeSingle();
      if (error) throw error;
      return data as AIGlobalAgent | null;
    },
  });
}

export function useUpdateJennyAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Partial<AIGlobalAgent> & { id: string }) => {
      const { id, ...payload } = updates;
      const { data, error } = await supabase
        .from("ai_global_agents" as any)
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as AIGlobalAgent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-ai-jenny"] });
      toast.success("Jenny atualizada.");
    },
    onError: (error: any) => toast.error(`Erro ao atualizar Jenny: ${error.message}`),
  });
}

export function useAIOrganizationSettings(agentId?: string) {
  return useQuery({
    queryKey: ["admin-ai-org-settings", agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_organization_settings" as any)
        .select("*")
        .eq("agent_id", agentId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as AIOrganizationSetting[];
    },
    enabled: !!agentId,
  });
}

export function useUpsertAIOrganizationSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<AIOrganizationSetting> & { organization_id: string; agent_id: string }) => {
      const { data, error } = await supabase
        .from("ai_organization_settings" as any)
        .upsert(input, { onConflict: "organization_id,agent_id" })
        .select()
        .single();
      if (error) throw error;
      return data as AIOrganizationSetting;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-ai-org-settings"] });
      toast.success("Configuração da organização salva.");
    },
    onError: (error: any) => toast.error(`Erro ao salvar configuração: ${error.message}`),
  });
}

export function useAdminAIOrganizations() {
  return useQuery({
    queryKey: ["admin-ai-organizations"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("admin_list_organizations", {
        p_search: "",
        p_segment: "all",
        p_status: "all",
      });
      if (error) throw error;
      return (data || []) as Array<{ id: string; name: string; segment: string; is_active: boolean }>;
    },
  });
}

export function useAdminAILogs() {
  return useQuery({
    queryKey: ["admin-ai-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_interaction_logs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return (data || []) as AIInteractionLog[];
    },
  });
}

export function useAdminAIOverview() {
  return useQuery({
    queryKey: ["admin-ai-overview"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("ai_interaction_logs" as any)
        .select("total_tokens, estimated_cost_usd, latency_ms, success")
        .gte("created_at", since);
      if (error) throw error;
      const rows = data || [];
      const totalInteractions = rows.length;
      const totalTokens = rows.reduce((sum: number, row: any) => sum + Number(row.total_tokens || 0), 0);
      const estimatedCost = rows.reduce((sum: number, row: any) => sum + Number(row.estimated_cost_usd || 0), 0);
      const latencyRows = rows.filter((row: any) => row.latency_ms != null);
      const avgLatencyMs = latencyRows.length
        ? Math.round(latencyRows.reduce((sum: number, row: any) => sum + Number(row.latency_ms || 0), 0) / latencyRows.length)
        : 0;
      const successRate = totalInteractions
        ? Math.round((rows.filter((row: any) => row.success).length / totalInteractions) * 100)
        : 100;
      return { totalInteractions, totalTokens, estimatedCost, avgLatencyMs, successRate } as AdminAIOverview;
    },
  });
}

export function useAIPreview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { organization_id: string; message: string; use_openai: boolean }) => {
      const { data, error } = await supabase.functions.invoke("ai-admin", {
        body: {
          action: "preview",
          ...input,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as {
        reply: string;
        model: string;
        mode: string;
        total_tokens: number;
        latency_ms: number;
        skipped_openai: boolean;
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-ai-logs"] });
      queryClient.invalidateQueries({ queryKey: ["admin-ai-overview"] });
    },
    onError: (error: any) => toast.error(`Erro no preview: ${error.message}`),
  });
}
