import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface StageOperationalConfig {
  id?: string;
  organization_id: string;
  stage_id: string;
  operation_context: 'comercial' | 'financeiro' | 'arquitetura' | 'engenharia' | 'compras' | 'documental' | 'juridico' | 'pos-venda';
  responsible_sector: string | null;
  sla_hours: number;
  automatic_tasks: any[];
  automatic_notifications: any[];
  automatic_operational_requests: any[];
  checklist_template: any[];
  approval_flow: any;
  dashboard_destination: string | null;
  visibility_rules: any;
}

export function useStageOperationalConfigs(pipelineId?: string, stageId?: string) {
  const { organization } = useAuth();

  return useQuery({
    queryKey: ["stage-operational-configs", organization?.id, pipelineId, stageId],
    queryFn: async () => {
      let query = supabase
        .from("stage_operational_configs" as any)
        .select(`
          *,
          stage:stages(id, name, pipeline_id)
        `)
        .eq("organization_id", organization?.id);

      if (pipelineId) query = query.eq("stage.pipeline_id", pipelineId);
      if (stageId) query = query.eq("stage_id", stageId);

      const { data, error } = await query;
      if (error) throw error;
      
      return (data || []) as unknown as (StageOperationalConfig & { stage: { name: string } })[];
    },
    enabled: !!organization?.id,
  });
}

export function useUpsertStageOperationalConfig() {
  const queryClient = useQueryClient();
  const { organization } = useAuth();

  return useMutation({
    mutationFn: async (values: Partial<StageOperationalConfig>) => {
      const { data, error } = await supabase
        .from("stage_operational_configs" as any)
        .upsert({
          ...values,
          organization_id: organization?.id,
          updated_at: new Date().toISOString()
        }, { onConflict: 'organization_id,stage_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stage-operational-configs"] });
      toast.success("Configuração do estágio salva!");
    },
    onError: (error: any) => {
      toast.error("Erro ao salvar configuração: " + error.message);
    }
  });
}
