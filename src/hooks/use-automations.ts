import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";

export type TriggerType =
  | "message_received"
  | "scheduled"
  | "lead_stage_changed"
  | "lead_created"
  | "tag_added"
  | "inactivity"
  | "manual";

export type NodeType = "trigger" | "action" | "condition" | "delay";

export type ActionType =
  | "send_whatsapp"
  | "send_whatsapp_template"
  | "send_email"
  | "send_image"
  | "send_audio"
  | "send_video"
  | "collect_input"
  | "move_lead"
  | "add_tag"
  | "remove_tag"
  | "create_task"
  | "assign_user"
  | "webhook"
  | "redirect"
  | "set_variable";

// JSON flow definition types (n8n-style)
export interface FlowNode {
  id: string;
  type: string;
  action_type?: string | null;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

export interface FlowConnection {
  source: string;
  target: string;
  source_handle?: string | null;
  condition_branch?: string | null;
}

export interface FlowDefinition {
  nodes: FlowNode[];
  connections: FlowConnection[];
  settings: Record<string, unknown>;
}

export interface Automation {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: TriggerType;
  trigger_config: Json;
  flow_definition?: FlowDefinition | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationNode {
  id: string;
  automation_id: string;
  node_type: NodeType;
  action_type: ActionType | null;
  config: Json;
  position_x: number;
  position_y: number;
  created_at: string;
}

export interface AutomationConnection {
  id: string;
  automation_id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle: string | null;
  condition_branch: string | null;
}

export interface AutomationExecution {
  id: string;
  automation_id: string;
  lead_id: string | null;
  conversation_id: string | null;
  organization_id: string;
  status: string;
  current_node_id: string | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  execution_data: Json;
  next_execution_at: string | null;
  lead?: {
    id: string;
    name: string | null;
  } | null;
  automation?: {
    id: string;
    name: string;
  } | null;
}

export interface AutomationTemplate {
  id: string;
  organization_id: string;
  name: string;
  content: string;
  media_url: string | null;
  media_type: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationWithNodes extends Automation {
  nodes: AutomationNode[];
  connections: AutomationConnection[];
}

export const TRIGGER_TYPE_LABELS: Record<TriggerType, string> = {
  message_received: "Mensagem Recebida",
  scheduled: "Agendado",
  lead_stage_changed: "Lead Mudou de Etapa",
  lead_created: "Lead Criado",
  tag_added: "Tag Adicionada",
  inactivity: "Inatividade",
  manual: "Manual",
};

export const TRIGGER_TYPE_DESCRIPTIONS: Record<TriggerType, string> = {
  message_received: "Dispara quando uma mensagem é recebida no WhatsApp",
  scheduled: "Dispara em horários programados (cron)",
  lead_stage_changed: "Dispara quando um lead muda de etapa",
  lead_created: "Dispara quando um novo lead é criado",
  tag_added: "Dispara quando uma tag é adicionada a um lead",
  inactivity: "Dispara após período de inatividade do lead",
  manual: "Disparo manual por ação do usuário",
};

// ─── FETCH ALL AUTOMATIONS ───────────────────────────────────────────────────
// FIX: removido filtro por created_by para usuários comuns.
// O RLS do banco já garante isolamento por organization_id — filtrar no
// frontend escondia automações criadas pelo admin que se aplicam a todos.
export function useAutomations() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["automations", profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("automations").select("*").order("created_at", { ascending: false });

      if (error) throw error;

      return (data as any[]).map((d) => ({
        ...d,
        flow_definition: d.flow_definition as FlowDefinition | null,
      })) as Automation[];
    },
    enabled: !!profile?.organization_id,
  });
}

// ─── FETCH SINGLE AUTOMATION ─────────────────────────────────────────────────
// Prioriza flow_definition JSON; cai no fallback de tabelas separadas se vazio.
export function useAutomation(automationId: string) {
  return useQuery({
    queryKey: ["automation", automationId],
    queryFn: async () => {
      const { data: automationData, error } = await supabase
        .from("automations")
        .select("*")
        .eq("id", automationId)
        .single();

      if (error) throw error;

      const flowDef = (automationData as any).flow_definition as FlowDefinition | null;

      // Se flow_definition existir, usa diretamente
      if (flowDef && flowDef.nodes && flowDef.nodes.length > 0) {
        const nodes: AutomationNode[] = flowDef.nodes.map((n) => ({
          id: n.id,
          automation_id: automationId,
          node_type: n.type as NodeType,
          action_type: (n.action_type || null) as ActionType | null,
          config: n.config as Json,
          position_x: n.position.x,
          position_y: n.position.y,
          created_at: automationData.created_at || "",
        }));

        const connections: AutomationConnection[] = flowDef.connections.map((c, i) => ({
          id: `conn-${i}`,
          automation_id: automationId,
          source_node_id: c.source,
          target_node_id: c.target,
          source_handle: c.source_handle || null,
          condition_branch: c.condition_branch || null,
        }));

        return {
          ...automationData,
          flow_definition: flowDef,
          nodes,
          connections,
        } as unknown as AutomationWithNodes;
      }

      // Fallback: carrega das tabelas separadas
      const [nodesRes, connectionsRes] = await Promise.all([
        supabase.from("automation_nodes").select("*").eq("automation_id", automationId).order("created_at"),
        supabase.from("automation_connections").select("*").eq("automation_id", automationId),
      ]);

      if (nodesRes.error) throw nodesRes.error;
      if (connectionsRes.error) throw connectionsRes.error;

      const nodes = (nodesRes.data || []).map((node: any) => ({
        ...node,
        config: node.node_config,
      }));

      return {
        ...automationData,
        nodes,
        connections: connectionsRes.data || [],
      } as unknown as AutomationWithNodes;
    },
    enabled: !!automationId,
  });
}

// ─── CREATE AUTOMATION ───────────────────────────────────────────────────────
export function useCreateAutomation() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      trigger_type: TriggerType;
      trigger_config?: Record<string, unknown>;
      flow_definition?: FlowDefinition;
    }) => {
      if (!profile?.organization_id) throw new Error("No organization");

      const insertData: any = {
        organization_id: profile.organization_id,
        name: data.name,
        description: data.description || null,
        trigger_type: data.trigger_type,
        trigger_config: (data.trigger_config || {}) as Json,
        created_by: profile.id,
        is_active: true,
      };

      if (data.flow_definition) {
        insertData.flow_definition = data.flow_definition as unknown as Json;
      }

      const { data: automation, error } = await supabase.from("automations").insert([insertData]).select().single();

      if (error) throw error;

      // Se não veio flow_definition, cria nó trigger inicial (backward compat)
      if (!data.flow_definition) {
        await supabase.from("automation_nodes").insert([
          {
            automation_id: automation.id,
            node_type: "trigger",
            node_config: { trigger_type: data.trigger_type, ...(data.trigger_config || {}) } as Json,
            position_x: 250,
            position_y: 50,
          },
        ]);
      }

      return automation as unknown as Automation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success("Automação criada com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar automação: ${error.message}`);
    },
  });
}

// ─── UPDATE AUTOMATION ───────────────────────────────────────────────────────
// FIX: lógica anterior deletava flow_definition do updateData e depois tentava
// recuperá-la — funcionava por acidente. Agora o fluxo é explícito e limpo.
export function useUpdateAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, flow_definition, ...rest }: Partial<Automation> & { id: string }) => {
      const updatePayload: any = { ...rest };

      if (flow_definition !== undefined) {
        updatePayload.flow_definition = flow_definition as unknown as Json;
      }

      const { error } = await supabase.from("automations").update(updatePayload).eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      queryClient.invalidateQueries({ queryKey: ["automation", variables.id] });
    },
  });
}

// ─── DELETE AUTOMATION ───────────────────────────────────────────────────────
export function useDeleteAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("automations").delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success("Automação excluída!");
    },
  });
}

// ─── TOGGLE ACTIVE ───────────────────────────────────────────────────────────
export function useToggleAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("automations").update({ is_active }).eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
  });
}

// ─── SAVE FLOW AS JSON (abordagem n8n-style) ─────────────────────────────────
export function useSaveAutomationFlowJSON() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ automationId, flowDefinition }: { automationId: string; flowDefinition: FlowDefinition }) => {
      const { error } = await supabase
        .from("automations")
        .update({ flow_definition: flowDefinition as unknown as Json })
        .eq("id", automationId);

      if (error) throw error;

      // Sincroniza nas tabelas separadas para compatibilidade com o engine
      await supabase.from("automation_connections").delete().eq("automation_id", automationId);
      await supabase.from("automation_nodes").delete().eq("automation_id", automationId);

      const nodesToInsert = flowDefinition.nodes.map((node) => ({
        automation_id: automationId,
        node_type: node.type || "action",
        action_type: node.action_type || null,
        node_config: (node.config || {}) as Json,
        position_x: node.position.x,
        position_y: node.position.y,
      }));

      const { data: insertedNodes, error: nodesError } = await supabase
        .from("automation_nodes")
        .insert(nodesToInsert)
        .select();

      if (nodesError) throw nodesError;

      const idMap = new Map<string, string>();
      flowDefinition.nodes.forEach((node, index) => {
        if (insertedNodes[index]) {
          idMap.set(node.id, insertedNodes[index].id);
        }
      });

      if (flowDefinition.connections.length > 0) {
        const connectionsToInsert = flowDefinition.connections
          .filter((conn) => idMap.has(conn.source) && idMap.has(conn.target))
          .map((conn) => ({
            automation_id: automationId,
            source_node_id: idMap.get(conn.source)!,
            target_node_id: idMap.get(conn.target)!,
            source_handle: conn.source_handle || null,
            condition_branch: conn.condition_branch || "default",
          }));

        if (connectionsToInsert.length > 0) {
          const { error: connError } = await supabase.from("automation_connections").insert(connectionsToInsert);

          if (connError) throw connError;
        }
      }

      return { nodes: insertedNodes };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["automation", variables.automationId] });
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
  });
}

// ─── SAVE FLOW LEGACY (tabelas separadas) ────────────────────────────────────
// FIX: adicionado tratamento de erro no update do flow_definition.
// Antes, se o update falhasse, o código continuava deletando/reinserindo
// nodes — deixando o banco em estado inconsistente.
export function useSaveAutomationFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      automationId,
      nodes,
      connections,
    }: {
      automationId: string;
      nodes: Partial<AutomationNode>[];
      connections: Partial<AutomationConnection>[];
    }) => {
      const flowDefinition: FlowDefinition = {
        nodes: nodes.map((n) => ({
          id: n.id || "",
          type: n.node_type || "action",
          action_type: n.action_type || null,
          position: { x: n.position_x || 0, y: n.position_y || 0 },
          config: (n.config || {}) as Record<string, unknown>,
        })),
        connections: connections.map((c) => ({
          source: c.source_node_id || "",
          target: c.target_node_id || "",
          source_handle: c.source_handle || null,
          condition_branch: c.condition_branch || null,
        })),
        settings: {},
      };

      // FIX: agora trata o erro antes de continuar
      const { error: flowError } = await supabase
        .from("automations")
        .update({ flow_definition: flowDefinition as unknown as Json })
        .eq("id", automationId);

      if (flowError) throw flowError;

      // Só apaga e recria nodes após confirmar que o JSON foi salvo
      await supabase.from("automation_connections").delete().eq("automation_id", automationId);
      await supabase.from("automation_nodes").delete().eq("automation_id", automationId);

      const nodesToInsert = nodes.map((node) => ({
        automation_id: automationId,
        node_type: node.node_type || "action",
        action_type: node.action_type || null,
        node_config: (node.config || {}) as Json,
        position_x: node.position_x || 0,
        position_y: node.position_y || 0,
      }));

      const { data: insertedNodes, error: nodesError } = await supabase
        .from("automation_nodes")
        .insert(nodesToInsert)
        .select();

      if (nodesError) throw nodesError;

      const idMap = new Map<string, string>();
      nodes.forEach((node, index) => {
        if (node.id && insertedNodes[index]) {
          idMap.set(node.id, insertedNodes[index].id);
        }
      });

      if (connections.length > 0) {
        const connectionsToInsert = connections
          .filter((conn) => idMap.has(conn.source_node_id || "") && idMap.has(conn.target_node_id || ""))
          .map((conn) => ({
            automation_id: automationId,
            source_node_id: idMap.get(conn.source_node_id || "")!,
            target_node_id: idMap.get(conn.target_node_id || "")!,
            source_handle: conn.source_handle || null,
            condition_branch: conn.condition_branch || "default",
          }));

        if (connectionsToInsert.length > 0) {
          const { error: connError } = await supabase.from("automation_connections").insert(connectionsToInsert);

          if (connError) throw connError;
        }
      }

      return { nodes: insertedNodes };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["automation", variables.automationId] });
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
  });
}

// ─── AUTOMATION TEMPLATES ─────────────────────────────────────────────────────
export function useAutomationTemplates() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["automation-templates", profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as AutomationTemplate[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (data: { name: string; content: string; media_url?: string; media_type?: string }) => {
      if (!profile?.organization_id) throw new Error("No organization");

      const { error } = await supabase.from("automation_templates").insert([
        {
          organization_id: profile.organization_id,
          name: data.name,
          content: data.content,
          media_url: data.media_url || null,
          media_type: data.media_type || null,
          created_by: profile.id,
        },
      ]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-templates"] });
      toast.success("Template criado!");
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("automation_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-templates"] });
      toast.success("Template excluído!");
    },
  });
}

// ─── CANCEL EXECUTION ────────────────────────────────────────────────────────
export function useCancelExecution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (executionId: string) => {
      const { error } = await supabase
        .from("automation_executions")
        .update({
          status: "cancelled",
          completed_at: new Date().toISOString(),
          error_message: "Cancelado manualmente pelo usuário",
        })
        .eq("id", executionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-executions"] });
      toast.success("Automação interrompida!");
    },
  });
}

// ─── EXECUTION LOGS ──────────────────────────────────────────────────────────
// FIX: adicionado limit configurável com padrão 50 (era 100 fixo sem paginação).
// Com refetchInterval de 10s, buscar 100 registros com joins a cada 10s
// pode gerar carga desnecessária conforme o histórico cresce.
export function useAutomationExecutions(automationId?: string, limit = 50) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["automation-executions", automationId, profile?.organization_id, limit],
    queryFn: async () => {
      let query = supabase
        .from("automation_executions")
        .select(
          `
          *,
          lead:leads(id, name),
          automation:automations(id, name)
        `,
        )
        .order("started_at", { ascending: false })
        .limit(limit);

      if (automationId) {
        query = query.eq("automation_id", automationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AutomationExecution[];
    },
    enabled: !!profile?.organization_id,
    refetchInterval: 10000,
  });
}
