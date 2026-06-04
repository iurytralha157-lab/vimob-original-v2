import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Extended types with new columns
export interface CadenceTaskTemplate {
  id: string;
  cadence_template_id: string;
  day_offset: number;
  title: string;
  description: string | null;
  position: number | null;
  // New columns from migration
  type: string | null;
  observation: string | null;
  recommended_message: string | null;
}

export interface CadenceTemplate {
  id: string;
  organization_id: string;
  stage_key: string;
  name: string;
  created_at: string;
  tasks: CadenceTaskTemplate[];
}

export function useCadenceTemplates() {
  return useQuery({
    queryKey: ['cadence-templates'],
    queryFn: async () => {
      // First, ensure cadence templates exist for all stages
      const { data: stages } = await supabase
        .from('stages')
        .select('stage_key, name')
        .order('position');
      
      const { data: existingTemplates } = await supabase
        .from('cadence_templates')
        .select('stage_key');
      
      const existingKeys = new Set((existingTemplates || []).map(t => t.stage_key));
      const missingStages = (stages || []).filter(s => !existingKeys.has(s.stage_key));
      
      // Create missing templates
      if (missingStages.length > 0) {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          const { data: userProfile } = await supabase
            .from('users')
            .select('organization_id')
            .eq('id', userData.user.id)
            .single();
          
          if (userProfile?.organization_id) {
            await supabase
              .from('cadence_templates')
              .insert(missingStages.map(s => ({
                stage_key: s.stage_key,
                name: s.name,
                organization_id: userProfile.organization_id,
              })));
          }
        }
      }
      
      // Now fetch all templates with tasks
      const { data: templates, error } = await supabase
        .from('cadence_templates')
        .select('*')
        .order('stage_key');
      
      if (error) throw error;
      
      // Get tasks for all templates
      const templateIds = (templates || []).map(t => t.id);
      const { data: tasks } = await supabase
        .from('cadence_tasks_template')
        .select('*')
        .in('cadence_template_id', templateIds.length > 0 ? templateIds : ['no-templates'])
        .order('day_offset')
        .order('position');
      
      const tasksByTemplate = (tasks || []).reduce((acc, task) => {
        if (!acc[task.cadence_template_id]) acc[task.cadence_template_id] = [];
        acc[task.cadence_template_id].push(task as unknown as CadenceTaskTemplate);
        return acc;
      }, {} as Record<string, CadenceTaskTemplate[]>);
      
      return (templates || []).map(template => ({
        ...template,
        tasks: tasksByTemplate[template.id] || [],
      })) as CadenceTemplate[];
    },
  });
}

export function useCreateCadenceTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (task: {
      cadence_template_id: string;
      day_offset: number;
      type: 'call' | 'message' | 'email' | 'note';
      title: string;
      description?: string;
      observation?: string;
      recommended_message?: string;
    }) => {
      const { data, error } = await supabase
        .from('cadence_tasks_template')
        .insert(task as any)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cadence-templates'] });
      toast.success('Tarefa adicionada!');
    },
    onError: (error) => {
      toast.error('Erro ao adicionar tarefa: ' + error.message);
    },
  });
}

export function useUpdateCadenceTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (task: {
      id: string;
      day_offset: number;
      type: 'call' | 'message' | 'email' | 'note';
      title: string;
      description?: string | null;
      observation?: string | null;
      recommended_message?: string | null;
    }) => {
      const { id, ...updates } = task;
      const { data, error } = await supabase
        .from('cadence_tasks_template')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cadence-templates'] });
      toast.success('Tarefa atualizada!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar tarefa: ' + error.message);
    },
  });
}

export function useDeleteCadenceTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('cadence_tasks_template')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cadence-templates'] });
      toast.success('Tarefa removida!');
    },
    onError: (error) => {
      toast.error('Erro ao remover tarefa: ' + error.message);
    },
  });
}
