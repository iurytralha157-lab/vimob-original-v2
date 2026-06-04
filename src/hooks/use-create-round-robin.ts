import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RoundRobinRule {
  match_type: string;
  match_value: string;
}

interface RoundRobinMember {
  user_id?: string;
  team_id?: string;
  weight?: number;
}

interface CreateRoundRobinInput {
  name: string;
  strategy: 'simple' | 'weighted';
  rules: RoundRobinRule[];
  members: RoundRobinMember[];
}

export function useCreateRoundRobin() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: CreateRoundRobinInput) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Não autenticado');
      
      const { data: profile } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', userData.user.id)
        .single();
      
      if (!profile?.organization_id) throw new Error('Organização não encontrada');
      
      // Create round robin
      const { data: roundRobin, error: rrError } = await supabase
        .from('round_robins')
        .insert({
          name: input.name,
          strategy: input.strategy,
          organization_id: profile.organization_id,
        })
        .select()
        .single();
      
      if (rrError) throw rrError;
      
      // Create rules
      if (input.rules.length > 0) {
        const rulesToInsert = input.rules.map(rule => ({
          round_robin_id: roundRobin.id,
          match_type: rule.match_type,
          match_value: rule.match_value,
        }));
        
        const { error: rulesError } = await supabase
          .from('round_robin_rules')
          .insert(rulesToInsert);
        
        if (rulesError) throw rulesError;
      }
      
      // Create members
      if (input.members.length > 0) {
        const membersToInsert = input.members.map((member, index) => ({
          round_robin_id: roundRobin.id,
          user_id: member.user_id || null,
          team_id: member.team_id || null,
          weight: member.weight || 1,
          position: index,
        }));
        
        const { error: membersError } = await supabase
          .from('round_robin_members')
          .insert(membersToInsert);
        
        if (membersError) throw membersError;
      }
      
      return roundRobin;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['round-robins'] });
      toast.success('Fila de distribuição criada!');
    },
    onError: (error) => {
      toast.error('Erro ao criar fila: ' + error.message);
    },
  });
}
