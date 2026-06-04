import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

// Extended type that includes new columns added by migration
export interface StageAutomation {
  id: string;
  stage_id: string | null;
  organization_id: string | null;
  trigger_type: string;
  action_type: string;
  action_config: Record<string, unknown> | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  // New columns from migration
  automation_type: string | null;
  trigger_days: number | null;
  target_stage_id: string | null;
  whatsapp_template: string | null;
  alert_message: string | null;
}

export type AutomationType = 
  | 'alert_on_inactivity'
  | 'change_assignee_on_enter'
  | 'change_deal_status_on_enter';

export interface CreateAutomationData {
  stage_id: string;
  automation_type: AutomationType;
  trigger_days?: number | null;
  target_stage_id?: string | null;
  whatsapp_template?: string | null;
  alert_message?: string | null;
  target_user_id?: string | null;
  deal_status?: 'open' | 'won' | 'lost' | null;
  action_config?: Record<string, unknown> | null;
  is_active?: boolean;
}

export function useStageAutomations(stageId?: string) {
  const { profile } = useAuth();
  const organizationId = profile?.organization_id;

  return useQuery({
    queryKey: ['stage-automations', stageId, organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      let query = supabase
        .from('stage_automations')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (stageId) {
        query = query.eq('stage_id', stageId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as unknown as StageAutomation[];
    },
    enabled: !!organizationId
  });
}

export function useCreateStageAutomation() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (data: CreateAutomationData) => {
      if (!profile?.organization_id) throw new Error('Organização não encontrada');

      // Build action_config based on automation type
      // Priority: pre-built action_config > direct fields (deal_status, target_user_id)
      let actionConfig: Record<string, unknown> = {};
      
      if (data.automation_type === 'change_assignee_on_enter') {
        if (data.action_config && (data.action_config as any).target_user_id) {
          actionConfig = data.action_config;
        } else if (data.target_user_id) {
          actionConfig = { target_user_id: data.target_user_id };
        }
      } else if (data.automation_type === 'change_deal_status_on_enter') {
        if (data.action_config && (data.action_config as any).deal_status) {
          actionConfig = data.action_config;
        } else if (data.deal_status) {
          actionConfig = { deal_status: data.deal_status };
        }
      }

      const insertData = {
        stage_id: data.stage_id,
        organization_id: profile.organization_id,
        automation_type: data.automation_type,
        trigger_type: 'on_enter', // default trigger
        action_type: data.automation_type, // use automation_type as action_type
        trigger_days: data.trigger_days || null,
        target_stage_id: data.target_stage_id || null,
        whatsapp_template: data.whatsapp_template || null,
        alert_message: data.alert_message || null,
        action_config: Object.keys(actionConfig).length > 0 ? (actionConfig as Json) : null,
        is_active: data.is_active ?? true,
      };

      const { data: result, error } = await supabase
        .from('stage_automations')
        .insert([insertData])
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: (_, variables) => {
      // Invalidate all stage-automations queries (uses partial matching)
      queryClient.invalidateQueries({ queryKey: ['stage-automations'], refetchType: 'all' });
      // Also refetch the specific stage query immediately
      queryClient.refetchQueries({ queryKey: ['stage-automations', variables.stage_id] });
      toast.success('Automação criada com sucesso');
    },
    onError: (error) => {
      console.error('Error creating automation:', error);
      toast.error('Erro ao criar Automação');
    }
  });
}

export function useUpdateStageAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<CreateAutomationData> & { id: string }) => {
      // Build action_config based on automation type (same logic as create)
      let actionConfig: Record<string, unknown> = {};
      
      if (data.automation_type === 'change_assignee_on_enter') {
        if (data.action_config && (data.action_config as any).target_user_id) {
          actionConfig = data.action_config;
        } else if (data.target_user_id) {
          actionConfig = { target_user_id: data.target_user_id };
        }
      } else if (data.automation_type === 'change_deal_status_on_enter') {
        if (data.action_config && (data.action_config as any).deal_status) {
          actionConfig = data.action_config;
        } else if (data.deal_status) {
          actionConfig = { deal_status: data.deal_status };
        }
      }

      const updateData = {
        automation_type: data.automation_type,
        trigger_days: data.trigger_days || null,
        target_stage_id: data.target_stage_id || null,
        whatsapp_template: data.whatsapp_template || null,
        alert_message: data.alert_message || null,
        action_config: Object.keys(actionConfig).length > 0 ? (actionConfig as Json) : null,
      };

      const { data: result, error } = await supabase
        .from('stage_automations')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stage-automations'], refetchType: 'all' });
      toast.success('Automação atualizada com sucesso');
    },
    onError: (error) => {
      console.error('Error updating automation:', error);
      toast.error('Erro ao atualizar Automação');
    }
  });
}

export function useDeleteStageAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('stage_automations')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stage-automations'] });
      toast.success('Automação excluída com sucesso');
    },
    onError: (error) => {
      console.error('Error deleting automation:', error);
      toast.error('Erro ao excluir Automação');
    }
  });
}

export function useToggleStageAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data: result, error } = await supabase
        .from('stage_automations')
        .update({ is_active })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stage-automations'] });
      toast.success(variables.is_active ? 'Automação ativada' : 'Automação desativada');
    },
    onError: (error) => {
      console.error('Error toggling automation:', error);
      toast.error('Erro ao alterar status da Automação');
    }
  });
}

export const AUTOMATION_TYPE_LABELS: Record<AutomationType, string> = {  'alert_on_inactivity': 'Alertar sobre inatividade',
  'change_assignee_on_enter': 'Mudar responsável ao entrar',
  'change_deal_status_on_enter': 'Alterar status (Ganho/Perdido)'
};

export const AUTOMATION_TYPE_DESCRIPTIONS: Record<AutomationType, string> = {  'alert_on_inactivity': 'Cria uma notificação para o corretor quando o lead ficar X dias sem atividade',
  'change_assignee_on_enter': 'Muda o responsável do lead automaticamente quando ele entra neste estágio',
  'change_deal_status_on_enter': 'Altera o status do deal (Aberto, Ganho ou Perdido) quando o lead entra'
};

export const DEAL_STATUS_LABELS: Record<string, string> = {
  'open': 'Aberto',
  'won': 'Ganho',
  'lost': 'Perdido'
};
