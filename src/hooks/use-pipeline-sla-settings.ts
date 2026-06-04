import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface PipelineSlaSettings {
  id: string;
  pipeline_id: string;
  stage_id: string | null;
  warning_hours: number | null;
  critical_hours: number | null;
  sla_start_field: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SlaSettingsInput {
  pipeline_id: string;
  stage_id?: string | null;
  warning_hours?: number;
  critical_hours?: number;
  sla_start_field?: string;
}

export function usePipelineSlaSettings(pipelineId: string | null) {
  return useQuery({
    queryKey: ["pipeline-sla-settings", pipelineId],
    queryFn: async () => {
      if (!pipelineId) return null;

      const { data, error } = await (supabase as any)
        .from("pipeline_sla_settings")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .maybeSingle();

      if (error) throw error;
      return data as PipelineSlaSettings | null;
    },
    enabled: !!pipelineId,
  });
}

export function useAllPipelineSlaSettings() {
  return useQuery({
    queryKey: ["all-pipeline-sla-settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pipeline_sla_settings")
        .select("*");

      if (error) throw error;
      return (data || []) as PipelineSlaSettings[];
    },
  });
}

export function useUpsertPipelineSlaSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: SlaSettingsInput) => {
      // First check if settings exist
      const { data: existing } = await (supabase as any)
        .from("pipeline_sla_settings")
        .select("id")
        .eq("pipeline_id", input.pipeline_id)
        .maybeSingle();

      if (existing) {
        // Update
        const { data, error } = await (supabase as any)
          .from("pipeline_sla_settings")
          .update({
            stage_id: input.stage_id,
            warning_hours: input.warning_hours,
            critical_hours: input.critical_hours,
            sla_start_field: input.sla_start_field,
          })
          .eq("id", existing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Insert
        const { data, error } = await (supabase as any)
          .from("pipeline_sla_settings")
          .insert({
            pipeline_id: input.pipeline_id,
            stage_id: input.stage_id ?? null,
            warning_hours: input.warning_hours ?? 24,
            critical_hours: input.critical_hours ?? 48,
            sla_start_field: input.sla_start_field ?? 'created_at',
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-sla-settings", variables.pipeline_id] });
      queryClient.invalidateQueries({ queryKey: ["all-pipeline-sla-settings"] });
      toast({
        title: "Configurações de SLA salvas",
        description: "As configurações foram atualizadas com sucesso.",
      });
    },
    onError: (error: Error) => {
      console.error("Error saving SLA settings:", error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as configurações de SLA.",
        variant: "destructive",
      });
    },
  });
}
