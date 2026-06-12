import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Validates that no condition values (meta_form, webhook, whatsapp_session, etc.) are already used in other queues
async function validateUniqueConditions(conditions: RuleCondition[], excludeRoundRobinId?: string) {
  const typesToCheck = ['meta_form', 'webhook', 'whatsapp_session'] as const;
  const conditionsToCheck = conditions.filter(c => typesToCheck.includes(c.type as any) && c.values.length > 0);

  if (conditionsToCheck.length === 0) return;

  // Fetch all existing rules for these match types
  let query = supabase
    .from('round_robin_rules')
    .select('match_type, match_value, round_robin_id, round_robins!inner(name)')
    .in('match_type', conditionsToCheck.map(c => c.type))
    .eq('is_active', true);

  if (excludeRoundRobinId) {
    query = query.neq('round_robin_id', excludeRoundRobinId);
  }

  const { data: existingRules } = await query;
  if (!existingRules || existingRules.length === 0) return;

  // Build a map of existing values per type
  const existingMap = new Map<string, { value: string; queueName: string }[]>();
  for (const rule of existingRules) {
    const values = (rule.match_value || '').split(',').filter(Boolean);
    const queueName = (rule as any).round_robins?.name || 'outra fila';
    for (const v of values) {
      const key = `${rule.match_type}::${v}`;
      if (!existingMap.has(key)) existingMap.set(key, []);
      existingMap.get(key)!.push({ value: v, queueName });
    }
  }

  // Check for conflicts
  const typeLabels: Record<string, string> = {
    meta_form: 'Formulário Meta',
    webhook: 'Webhook',
    whatsapp_session: 'Sessão WhatsApp',
  };

  for (const condition of conditionsToCheck) {
    for (const val of condition.values) {
      const key = `${condition.type}::${val}`;
      const conflicts = existingMap.get(key);
      if (conflicts && conflicts.length > 0) {
        const queueNames = [...new Set(conflicts.map(c => c.queueName))].join(', ');
        throw new Error(
          `${typeLabels[condition.type] || condition.type} já está configurado na fila "${queueNames}". Remova-o da outra fila antes de usar aqui.`
        );
      }
    }
  }
}

interface ScheduleDay {
  day: number;
  enabled: boolean;
  start: string;
  end: string;
}

interface RuleCondition {
  id: string;
  type: 'source' | 'webhook' | 'whatsapp_session' | 'meta_form' | 'website_category' | 'campaign_contains' | 'tag' | 'city' | 'interest_property' | 'interest_plan';
  values: string[];
}

interface QueueMember {
  id?: string;
  type: 'user' | 'team';
  entityId: string;
  weight: number;
  name?: string;
}

interface QueueSettings {
  enable_redistribution?: boolean;
  redistribution_timeout_minutes?: number;
  redistribution_warning_minutes?: number;
  redistribution_max_attempts?: number;
  preserve_position?: boolean;
  require_checkin?: boolean;
  reentry_behavior?: 'redistribute' | 'keep_assignee';
}

interface CreateQueueInput {
  name: string;
  strategy: 'simple' | 'weighted';
  target_pipeline_id: string;
  target_stage_id: string;
  is_active: boolean;
  settings: QueueSettings;
  schedule?: ScheduleDay[];
  conditions: RuleCondition[];
  members: QueueMember[];
  ai_agent_id?: string | null;
}

export function useCreateQueueAdvanced() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: CreateQueueInput) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Não autenticado');
      
      const { data: profile } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', userData.user.id)
        .single();
      
      if (!profile?.organization_id) throw new Error('Organização não encontrada');
      
      // Validate no duplicate conditions across queues
      await validateUniqueConditions(input.conditions);
      
      // Combine settings with schedule (schedule é opcional)
      const fullSettings = {
        ...input.settings,
        ...(input.schedule && input.schedule.length > 0
          ? {
              schedule: input.schedule.map(s => ({
                day: s.day,
                enabled: s.enabled,
                start: s.start,
                end: s.end,
              })),
            }
          : {}),
      };
      
      // Create round robin with reentry_behavior
      const { data: roundRobin, error: rrError } = await supabase
        .from('round_robins')
        .insert({
          name: input.name,
          strategy: input.strategy,
          organization_id: profile.organization_id,
          created_by: userData.user.id,
          is_active: input.is_active,
          target_pipeline_id: input.target_pipeline_id || null,
          target_stage_id: input.target_stage_id || null,
          settings: fullSettings as any,
          reentry_behavior: input.settings.reentry_behavior || 'redistribute',
          ai_agent_id: input.ai_agent_id || null,
        })
        .select()
        .single();
      
      if (rrError) throw rrError;
      
      // Sync redistribution settings to pipeline
      if (input.target_pipeline_id) {
        if (input.settings.enable_redistribution) {
          await supabase
            .from('pipelines')
            .update({
              pool_enabled: true,
              pool_timeout_minutes: input.settings.redistribution_timeout_minutes ?? 10,
              pool_warning_minutes: input.settings.redistribution_warning_minutes ?? 2,
              pool_max_redistributions: input.settings.redistribution_max_attempts ?? 3,
              pool_enabled_at: new Date().toISOString(),
            })
            .eq('id', input.target_pipeline_id);
        } else {
          await supabase
            .from('pipelines')
            .update({ pool_enabled: false })
            .eq('id', input.target_pipeline_id);
        }
      }
      const validConditions = input.conditions.filter(c => c.values.length > 0);
      
      if (validConditions.length > 0) {
        const rulesToInsert = validConditions.map((condition, index) => {
          // Build match JSONB based on condition type
          let matchValue: Record<string, any> = {};
          
          switch (condition.type) {
            case 'source':
              matchValue = { source: condition.values };
              break;
            case 'webhook':
              matchValue = { webhook_id: condition.values };
              break;
            case 'whatsapp_session':
              matchValue = { whatsapp_session_id: condition.values };
              break;
            case 'meta_form':
              matchValue = { meta_form_id: condition.values };
              break;
            case 'website_category':
              matchValue = { website_category: condition.values };
              break;
            case 'campaign_contains':
              matchValue = { campaign_name_contains: condition.values[0] };
              break;
            case 'tag':
              matchValue = { tag_in: condition.values };
              break;
            case 'city':
              matchValue = { city_in: condition.values };
              break;
            case 'interest_property':
              matchValue = { interest_property_id: condition.values[0] };
              break;
            case 'interest_plan':
              matchValue = { interest_plan_id: condition.values[0] };
              break;
          }
          
          return {
            round_robin_id: roundRobin.id,
            match_type: condition.type,
            match_value: condition.values.join(','),
            match: matchValue,
            priority: validConditions.length - index,
            is_active: true,
          };
        });
        
        const { error: rulesError } = await supabase
          .from('round_robin_rules')
          .insert(rulesToInsert);
        
        if (rulesError) throw rulesError;
      }
      
      // Create members - only insert user members directly
      // For team members, we need to expand to individual users
      if (input.members.length > 0) {
        const membersToInsert: any[] = [];
        
        for (const member of input.members) {
          if (member.type === 'user') {
            membersToInsert.push({
              round_robin_id: roundRobin.id,
              user_id: member.entityId,
              team_id: null,
              weight: member.weight,
              position: membersToInsert.length,
            });
          } else if (member.type === 'team') {
            // Get all users from the team
            const { data: teamMembers } = await supabase
              .from('team_members')
              .select('user_id')
              .eq('team_id', member.entityId);
            
            if (teamMembers && teamMembers.length > 0) {
              for (const tm of teamMembers) {
                membersToInsert.push({
                  round_robin_id: roundRobin.id,
                  user_id: tm.user_id,
                  team_id: member.entityId,
                  weight: member.weight,
                  position: membersToInsert.length,
                });
              }
            }
          }
        }
        
        if (membersToInsert.length > 0) {
          const { error: membersError } = await supabase
            .from('round_robin_members')
            .insert(membersToInsert);
          
          if (membersError) throw membersError;
        }
      }
      
      return roundRobin;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['round-robins'] });
      queryClient.invalidateQueries({ queryKey: ['round-robin-rules'] });
      toast.success('Fila de distribuição criada!');
    },
    onError: (error) => {
      toast.error('Erro ao criar fila: ' + error.message);
    },
  });
}

export function useUpdateQueueAdvanced() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...input }: CreateQueueInput & { id: string }) => {
      // Validate no duplicate conditions across queues (exclude current queue)
      await validateUniqueConditions(input.conditions, id);
      
      // Combine settings with schedule (schedule é opcional)
      const fullSettings = {
        ...input.settings,
        ...(input.schedule && input.schedule.length > 0
          ? {
              schedule: input.schedule.map(s => ({
                day: s.day,
                enabled: s.enabled,
                start: s.start,
                end: s.end,
              })),
            }
          : {}),
      };
      
      // Update round robin with reentry_behavior
      const { error: rrError } = await supabase
        .from('round_robins')
        .update({
          name: input.name,
          strategy: input.strategy,
          is_active: input.is_active,
          target_pipeline_id: input.target_pipeline_id || null,
          target_stage_id: input.target_stage_id || null,
          settings: fullSettings as any,
          reentry_behavior: input.settings.reentry_behavior || 'redistribute',
          ai_agent_id: input.ai_agent_id || null,
        })
        .eq('id', id);
      
      if (rrError) throw rrError;
      
      // Sync redistribution settings to pipeline
      if (input.target_pipeline_id) {
        if (input.settings.enable_redistribution) {
          await supabase
            .from('pipelines')
            .update({
              pool_enabled: true,
              pool_timeout_minutes: input.settings.redistribution_timeout_minutes ?? 10,
              pool_warning_minutes: input.settings.redistribution_warning_minutes ?? 2,
              pool_max_redistributions: input.settings.redistribution_max_attempts ?? 3,
              pool_enabled_at: new Date().toISOString(),
            })
            .eq('id', input.target_pipeline_id);
        } else {
          await supabase
            .from('pipelines')
            .update({ pool_enabled: false })
            .eq('id', input.target_pipeline_id);
        }
      }
      
      // Delete existing rules and recreate
      await supabase
        .from('round_robin_rules')
        .delete()
        .eq('round_robin_id', id);
      
      // FILTER OUT EMPTY CONDITIONS before saving
      const validConditions = input.conditions.filter(c => c.values.length > 0);
      
      if (validConditions.length > 0) {
        const rulesToInsert = validConditions.map((condition, index) => {
          let matchValue: Record<string, any> = {};
          
          switch (condition.type) {
            case 'source':
              matchValue = { source: condition.values };
              break;
            case 'webhook':
              matchValue = { webhook_id: condition.values };
              break;
            case 'whatsapp_session':
              matchValue = { whatsapp_session_id: condition.values };
              break;
            case 'meta_form':
              matchValue = { meta_form_id: condition.values };
              break;
            case 'website_category':
              matchValue = { website_category: condition.values };
              break;
            case 'campaign_contains':
              matchValue = { campaign_name_contains: condition.values[0] };
              break;
            case 'tag':
              matchValue = { tag_in: condition.values };
              break;
            case 'city':
              matchValue = { city_in: condition.values };
              break;
            case 'interest_property':
              matchValue = { interest_property_id: condition.values[0] };
              break;
            case 'interest_plan':
              matchValue = { interest_plan_id: condition.values[0] };
              break;
          }
          
          return {
            round_robin_id: id,
            match_type: condition.type,
            match_value: condition.values.join(','),
            match: matchValue,
            priority: validConditions.length - index,
            is_active: true,
          };
        });
        
        await supabase
          .from('round_robin_rules')
          .insert(rulesToInsert);
      }
      
      // Smart sync for members
      const { data: existingMembers, error: fetchMembersError } = await supabase
        .from('round_robin_members')
        .select('id, user_id, team_id, leads_count')
        .eq('round_robin_id', id);
      
      if (fetchMembersError) throw fetchMembersError;

      const membersToInsert: any[] = [];
      const memberIdsToKeep = new Set<string>();
      
      let currentPosition = 0;
      for (const member of input.members) {
        if (member.type === 'user') {
          const existing = existingMembers?.find(m => m.user_id === member.entityId && m.team_id === null);
          if (existing) {
            memberIdsToKeep.add(existing.id);
            await supabase
              .from('round_robin_members')
              .update({ weight: member.weight, position: currentPosition })
              .eq('id', existing.id);
          } else {
            membersToInsert.push({
              round_robin_id: id,
              user_id: member.entityId,
              team_id: null,
              weight: member.weight,
              position: currentPosition,
            });
          }
          currentPosition++;
        } else if (member.type === 'team') {
          const { data: teamMembers } = await supabase
            .from('team_members')
            .select('user_id')
            .eq('team_id', member.entityId);
          
          if (teamMembers && teamMembers.length > 0) {
            for (const tm of teamMembers) {
              const existing = existingMembers?.find(m => m.user_id === tm.user_id && m.team_id === member.entityId);
              if (existing) {
                memberIdsToKeep.add(existing.id);
                await supabase
                  .from('round_robin_members')
                  .update({ weight: member.weight, position: currentPosition })
                  .eq('id', existing.id);
              } else {
                membersToInsert.push({
                  round_robin_id: id,
                  user_id: tm.user_id,
                  team_id: member.entityId,
                  weight: member.weight,
                  position: currentPosition,
                });
              }
              currentPosition++;
            }
          }
        }
      }

      // Remove members that are no longer in the queue
      const idsToRemove = existingMembers
        ?.filter(m => !memberIdsToKeep.has(m.id))
        .map(m => m.id) || [];

      if (idsToRemove.length > 0) {
        await supabase
          .from('round_robin_members')
          .delete()
          .in('id', idsToRemove);
      }
      
      // Insert new members
      if (membersToInsert.length > 0) {
        await supabase
          .from('round_robin_members')
          .insert(membersToInsert);
      }
      
      return { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['round-robins'] });
      queryClient.invalidateQueries({ queryKey: ['round-robin-rules'] });
      toast.success('Fila atualizada!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar fila: ' + error.message);
    },
  });
}
