import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface MessageTemplate {
  id: string;
  organization_id: string;
  name: string;
  content: string;
  category: string;
  variables: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateInput {
  name: string;
  content: string;
  category?: string;
  variables?: string[];
}

export interface TemplateVariables {
  nome?: string;
  corretor?: string;
  imobiliaria?: string;
  data?: string;
  horario?: string;
  empreendimento?: string;
  [key: string]: string | undefined;
}

/**
 * Substitui variáveis no template por valores reais
 * Ex: "Olá {nome}!" => "Olá João!"
 */
export function replaceTemplateVariables(content: string, variables: TemplateVariables): string {
  let result = content;
  
  Object.entries(variables).forEach(([key, value]) => {
    if (value) {
      const regex = new RegExp(`\\{${key}\\}`, 'gi');
      result = result.replace(regex, value);
    }
  });
  
  return result;
}

/**
 * Extrai variáveis de um template
 * Ex: "Olá {nome}, sua visita é {data}" => ["nome", "data"]
 */
export function extractTemplateVariables(content: string): string[] {
  const regex = /\{(\w+)\}/g;
  const matches = content.matchAll(regex);
  const variables = new Set<string>();
  
  for (const match of matches) {
    variables.add(match[1].toLowerCase());
  }
  
  return Array.from(variables);
}

export function useMessageTemplates() {
  return useQuery({
    queryKey: ['message-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_message_templates')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data as MessageTemplate[];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useMessageTemplatesByCategory() {
  const { data: templates, ...rest } = useMessageTemplates();
  
  const groupedTemplates = templates?.reduce((acc, template) => {
    const category = template.category || 'geral';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(template);
    return acc;
  }, {} as Record<string, MessageTemplate[]>) || {};
  
  return { data: groupedTemplates, ...rest };
}

export function useCreateMessageTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: CreateTemplateInput) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', userData.user?.id)
        .single();
      
      if (!profile?.organization_id) {
        throw new Error('Organização não encontrada');
      }
      
      const variables = extractTemplateVariables(input.content);
      
      const { data, error } = await supabase
        .from('whatsapp_message_templates')
        .insert({
          organization_id: profile.organization_id,
          name: input.name,
          content: input.content,
          category: input.category || 'geral',
          variables,
          created_by: userData.user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as MessageTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] });
      toast.success('Template criado com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao criar template: ' + error.message);
    },
  });
}

export function useUpdateMessageTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<CreateTemplateInput> & { id: string }) => {
      const variables = input.content ? extractTemplateVariables(input.content) : undefined;
      
      const { data, error } = await supabase
        .from('whatsapp_message_templates')
        .update({
          ...input,
          ...(variables ? { variables } : {}),
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as MessageTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] });
      toast.success('Template atualizado!');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar: ' + error.message);
    },
  });
}

export function useDeleteMessageTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('whatsapp_message_templates')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] });
      toast.success('Template excluído!');
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir: ' + error.message);
    },
  });
}

// Category labels for UI
export const TEMPLATE_CATEGORIES: Record<string, string> = {
  saudacao: 'Saudação',
  follow_up: 'Follow-up',
  agendamento: 'Agendamento',
  pos_visita: 'Pós-visita',
  negociacao: 'Negociação',
  geral: 'Geral',
};
