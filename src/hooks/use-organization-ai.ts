import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { AIOrganizationSetting, AIGlobalAgent } from "@/hooks/use-admin-ai";
import { toast } from "sonner";

export const DEFAULT_ORG_AI_SETTING = {
  mode: "preview" as const,
  is_enabled: false,
  allowed_contexts: ["lead_basic", "conversation_recent", "properties_public"],
  organization_prompt: "",
  business_rules: "",
  handoff_keywords: ["humano", "atendente", "corretor", "especialista", "ligar"],
  require_human_approval: false,
  daily_token_budget: 3000,
  monthly_token_budget: 60000,
  max_output_tokens: 340,
  max_context_messages: 4,
  pii_redaction_enabled: true,
  store_ai_outputs: true,
};

export interface OrganizationAIUsage {
  requests: number;
  tokens: number;
  messagesSent: number;
  leadsAttended: number;
  leadsQualified: number;
  successRate: number;
  recentQualified: Array<{
    id: string;
    leadId: string | null;
    leadName: string;
    leadPhone: string | null;
    summary: string;
    reason: string;
    handedOffAt: string | null;
  }>;
}

const EMPTY_USAGE: OrganizationAIUsage = {
  requests: 0,
  tokens: 0,
  messagesSent: 0,
  leadsAttended: 0,
  leadsQualified: 0,
  successRate: 100,
  recentQualified: [],
};

export function useOrganizationAISettings() {
  const { organization, profile } = useAuth();
  const organizationId = organization?.id || profile?.organization_id || null;

  const agentQuery = useQuery({
    queryKey: ["organization-ai-agent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_global_agents" as any)
        .select("*")
        .eq("slug", "jenny")
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;
      return data as AIGlobalAgent | null;
    },
  });

  const settingQuery = useQuery({
    queryKey: ["organization-ai-setting", organizationId, agentQuery.data?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_organization_settings" as any)
        .select("*")
        .eq("organization_id", organizationId!)
        .eq("agent_id", agentQuery.data!.id)
        .maybeSingle();

      if (error) throw error;
      return data as AIOrganizationSetting | null;
    },
    enabled: !!organizationId && !!agentQuery.data?.id,
  });

  const effectiveSetting = {
    ...DEFAULT_ORG_AI_SETTING,
    ...(settingQuery.data || {}),
    organization_id: organizationId || "",
    agent_id: agentQuery.data?.id || "",
  } as AIOrganizationSetting;

  return {
    organizationId,
    agent: agentQuery.data || null,
    setting: settingQuery.data || null,
    effectiveSetting,
    isLoading: agentQuery.isLoading || settingQuery.isLoading,
    error: agentQuery.error || settingQuery.error,
  };
}

export function useSaveOrganizationAISetting() {
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
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["organization-ai-setting", input.organization_id] });
      queryClient.invalidateQueries({ queryKey: ["admin-ai-org-settings"] });
      toast.success("Configuracao da Jhenny salva.");
    },
    onError: (error: any) => toast.error(`Erro ao salvar configuracao: ${error.message}`),
  });
}

export function useOrganizationAIUsage(days = 30) {
  const { organization, profile } = useAuth();
  const organizationId = organization?.id || profile?.organization_id || null;

  return useQuery({
    queryKey: ["organization-ai-usage", organizationId, days],
    queryFn: async () => {
      if (!organizationId) return EMPTY_USAGE;

      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const [logsResult, messagesResult, conversationsResult] = await Promise.all([
        supabase
          .from("ai_interaction_logs" as any)
          .select("id, conversation_id, total_tokens, success, created_at, event_type")
          .eq("organization_id", organizationId)
          .gte("created_at", since),
        supabase
          .from("whatsapp_messages" as any)
          .select("id, conversation_id, sent_at, sender_name, conversation:whatsapp_conversations!inner(organization_id)")
          .eq("from_me", true)
          .ilike("sender_name", "%Jhenny%")
          .gte("sent_at", since)
          .eq("conversation.organization_id", organizationId),
        supabase
          .from("ai_agent_conversations" as any)
          .select(`
            id,
            conversation_id,
            lead_id,
            status,
            memory_summary,
            handoff_reason,
            handed_off_at,
            updated_at,
            lead:leads(id, name, phone),
            agent:ai_agents!inner(organization_id)
          `)
          .eq("agent.organization_id", organizationId)
          .gte("updated_at", since)
          .order("updated_at", { ascending: false }),
      ]);

      if (logsResult.error) throw logsResult.error;
      if (messagesResult.error) throw messagesResult.error;
      if (conversationsResult.error) throw conversationsResult.error;

      const logs = logsResult.data || [];
      const messages = messagesResult.data || [];
      const conversations = conversationsResult.data || [];
      const qualifiedRows = conversations.filter((row: any) => row.status === "handed_off");
      const attendedIds = new Set<string>();

      for (const row of conversations as any[]) {
        if (row.lead_id || row.conversation_id) attendedIds.add(row.lead_id || row.conversation_id);
      }
      for (const row of logs as any[]) {
        if (row.conversation_id) attendedIds.add(row.conversation_id);
      }

      const totalTokens = logs.reduce((sum: number, row: any) => sum + Number(row.total_tokens || 0), 0);
      const successRows = logs.filter((row: any) => row.success !== false);

      return {
        requests: logs.length,
        tokens: totalTokens,
        messagesSent: messages.length,
        leadsAttended: attendedIds.size,
        leadsQualified: new Set(qualifiedRows.map((row: any) => row.lead_id || row.conversation_id)).size,
        successRate: logs.length ? Math.round((successRows.length / logs.length) * 100) : 100,
        recentQualified: qualifiedRows.slice(0, 8).map((row: any) => ({
          id: row.id,
          leadId: row.lead_id || null,
          leadName: row.lead?.name || "Lead sem nome",
          leadPhone: row.lead?.phone || null,
          summary: row.memory_summary || "Resumo ainda nao registrado.",
          reason: row.handoff_reason || "handoff",
          handedOffAt: row.handed_off_at || row.updated_at || null,
        })),
      } as OrganizationAIUsage;
    },
    enabled: !!organizationId,
  });
}
