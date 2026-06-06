import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Tables } from '@/integrations/supabase/types';
import { normalizePhone } from '@/lib/phone-utils';
import { enforceClientActionRateLimit, getClientRateLimitMessage } from '@/lib/client-action-rate-limit';
import { notifyLeadCreated } from './use-lead-notifications';
import { logAuditAction } from './use-audit-logs';
import { notificationService } from '@/services/NotificationService';
export type Lead = Tables<'leads'> & {
  tags?: { id: string; name: string; color: string }[];
  assignee?: { id: string; name: string; avatar_url: string | null };
  stage?: { id: string; name: string; color: string; stage_key: string };
};

// Campos otimizados para listagem (evita SELECT *)
const LEAD_LIST_FIELDS = `
  id, name, phone, email, source, created_at, updated_at,
  stage_id, assigned_user_id, pipeline_id, organization_id,
  property_code, message, deal_status, won_at, lost_at,
  stage:stages(id, name, color, stage_key),
  assignee:users!leads_assigned_user_id_fkey(id, name, avatar_url)
`;

export function useLeads(filters?: { 
  stageId?: string; 
  assigneeId?: string; 
  search?: string;
  limit?: number;
}) {
  const limit = filters?.limit || 200;
  
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select(LEAD_LIST_FIELDS)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
      } else {
        if (filters?.stageId) {
          query = query.eq('stage_id', filters.stageId);
        }
        if (filters?.assigneeId) {
          query = query.eq('assigned_user_id', filters.assigneeId);
        }
      }
      
      const { data, error } = await query;
      if (error) throw error;

      // Buscar tags apenas para os leads retornados (batch otimizado)
      const leadIds = (data || []).map(l => l.id);
      if (leadIds.length === 0) return [] as Lead[];

      const { data: leadTags } = await supabase
        .from('lead_tags')
        .select('lead_id, tag:tags(id, name, color)')
        .in('lead_id', leadIds);

      const tagsByLead = (leadTags || []).reduce((acc, lt) => {
        if (!acc[lt.lead_id]) acc[lt.lead_id] = [];
        if (lt.tag) acc[lt.lead_id].push(lt.tag as any);
        return acc;
      }, {} as Record<string, { id: string; name: string; color: string }[]>);

      return (data || []).map(lead => ({
        ...lead,
        tags: tagsByLead[lead.id] || [],
      })) as Lead[];
    },
  });
}

export function useLead(id: string | null) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          stage:stages(id, name, color, stage_key),
          assignee:users!leads_assigned_user_id_fkey(id, name, avatar_url)
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      
      // Get tags
      const { data: leadTags } = await supabase
        .from('lead_tags')
        .select('tag:tags(id, name, color)')
        .eq('lead_id', id);
      
      return {
        ...data,
        tags: (leadTags || []).map(lt => lt.tag).filter(Boolean),
      } as Lead;
    },
    enabled: !!id,
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (lead: {
      name: string;
      phone?: string;
      email?: string;
      message?: string;
      source?: string;
      stage_id?: string;
      pipeline_id?: string;
      property_code?: string;
      assigned_user_id?: string;
      tag_ids?: string[];
      // Additional profile fields
      cargo?: string;
      empresa?: string;
      profissao?: string;
      endereco?: string;
      cidade?: string;
      uf?: string;
      renda_familiar?: string;
      faixa_valor_imovel?: string;
      valor_interesse?: number | null;
      property_id?: string;
      deal_status?: string;
      lost_reason?: string;
      is_own_resource?: boolean;
    }) => {
      const { data: authUser } = await supabase.auth.getUser();
      enforceClientActionRateLimit(`lead:create:${authUser.user?.id || 'anonymous'}`, [
        { limit: 1, windowMs: 1000 },
        { limit: 10, windowMs: 60_000 },
      ]);

      // Buscar usuÃ¡rio autenticado - org_id Ã© definido pelo trigger enforce_organization_id()
      const user = authUser;
      if (!user.user) throw new Error('Usuário não autenticado');
      
      // Buscar org_id para verificaÃ§Ã£o de leads duplicados (nÃ£o para INSERT)
      const { data: userData } = await supabase
        .from('users')
        .select('organization_id, name')
        .eq('id', user.user.id)
        .single();
      const organizationId = userData?.organization_id;
      
      if (!organizationId) throw new Error('Usuário não possui organização');

      // Resolve destino antes de tratar duplicidade para reentrada aparecer na coluna escolhida.
      let pipelineId = lead.pipeline_id;
      let stageId = lead.stage_id;
      
      if (!pipelineId) {
        const { data: pipeline } = await supabase
          .from('pipelines')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('is_default', true)
          .single();
        
        pipelineId = pipeline?.id;
      }
      
      if (!stageId && pipelineId) {
        const { data: stage } = await supabase
          .from('stages')
          .select('id')
          .eq('pipeline_id', pipelineId)
          .order('position')
          .limit(1)
          .single();
        
        stageId = stage?.id;
      }
      
      // ===== VERIFICAR SE JÃ EXISTE LEAD COM ESTE TELEFONE =====
      if (lead.phone) {
        const normalizedPhone = normalizePhone(lead.phone);
        
        if (normalizedPhone) {
          // Buscar leads existentes com telefone similar
          const { data: existingLeads } = await supabase
            .from('leads')
            .select('id, phone, assigned_user_id, assignee:users!leads_assigned_user_id_fkey(name)')
            .eq('organization_id', organizationId)
            .not('phone', 'is', null);
          
          // Verificar se algum lead tem o mesmo telefone normalizado
          const existingLead = existingLeads?.find(l => {
            if (!l.phone) return false;
            return normalizePhone(l.phone) === normalizedPhone;
          });
          
          if (existingLead) {
            const reentryAt = new Date().toISOString();

            // Registrar reentrada via RPC
            const { error: reentryError } = await (supabase.rpc as any)('register_lead_reentry', {
              p_lead_id: existingLead.id,
              p_org_id: organizationId,
              p_entry_type: 'manual_reentry',
              p_source: lead.source || 'manual',
              p_property_id: lead.property_id || null,
              p_valor_interesse: lead.valor_interesse || null,
              p_metadata: {
                new_data: {
                  name: lead.name,
                  email: lead.email,
                  message: lead.message,
                  property_code: lead.property_code
                }
              }
            });

            if (reentryError) {
              console.error('Erro ao registrar reentrada:', reentryError);
            }

            const reentryUpdate: Record<string, any> = {
              name: lead.name,
              email: lead.email || null,
              message: lead.message || null,
              last_entry_at: reentryAt,
              updated_at: reentryAt,
            };

            if (pipelineId) reentryUpdate.pipeline_id = pipelineId;
            if (stageId) {
              reentryUpdate.stage_id = stageId;
              reentryUpdate.stage_entered_at = reentryAt;
            }
            if (lead.property_id) reentryUpdate.interest_property_id = lead.property_id;
            if (lead.valor_interesse !== undefined) reentryUpdate.valor_interesse = lead.valor_interesse;

            const { error: updateExistingError } = await supabase
              .from('leads')
              .update(reentryUpdate)
              .eq('id', existingLead.id);

            if (updateExistingError) throw updateExistingError;

            const existingAssignee = (existingLead as any).assignee;
            const assignedUserName = (
              Array.isArray(existingAssignee) ? existingAssignee[0]?.name : existingAssignee?.name
            ) || 'sem responsável';
            const actorName = userData?.name || user.user.email || 'Usuário';
            const reentryDateLabel = new Intl.DateTimeFormat('pt-BR', {
              timeZone: 'America/Sao_Paulo',
            }).format(new Date(reentryAt));

            const { error: manualReentryActivityError } = await supabase.from('activities').insert({
              lead_id: existingLead.id,
              user_id: user.user.id,
              type: 'lead_reentry',
              content: `Nova entrada manual registrada por ${actorName} em ${reentryDateLabel}. Lead mantido com ${assignedUserName}.`,
              metadata: {
                entry_type: 'manual_reentry',
                source: lead.source || 'manual',
                actor_id: user.user.id,
                actor_name: actorName,
                assigned_user_id: existingLead.assigned_user_id || null,
                assigned_user_name: assignedUserName,
                kept_assignee: true,
                registered_at: reentryAt,
                pipeline_id: pipelineId || null,
                stage_id: stageId || null,
                property_id: lead.property_id || null,
                property_code: lead.property_code || null,
              },
            });
            if (manualReentryActivityError) {
              console.error('Erro ao registrar atividade de reentrada manual:', manualReentryActivityError);
            }

            toast.success(`Lead já existia e foi atualizado. Responsável atual: ${assignedUserName}`);
            
            // Notify assignee about re-entry
            if (existingLead.id && organizationId) {
              const { data: leadData } = await supabase
                .from('leads')
                .select('assigned_user_id')
                .eq('id', existingLead.id)
                .single();
              
              if (leadData?.assigned_user_id) {
                await notificationService.send({
                  eventKey: 'lead_reentry',
                  organizationId: organizationId,
                  userId: leadData.assigned_user_id,
                  leadId: existingLead.id,
                  dedupeKey: `lead_reentry:${existingLead.id}`,
                  variables: {
                    lead_name: lead.name,
                    source: lead.source || 'manual'
                  }
                });
              }

              await notificationService.send({
                eventKey: 'lead_duplicate_existing',
                organizationId: organizationId,
                userId: user.user.id,
                leadId: existingLead.id,
                dedupeKey: `lead_duplicate_existing:${existingLead.id}:${user.user.id}:${reentryAt}`,
                variables: {
                  lead_name: lead.name,
                  assignee_name: assignedUserName,
                  source: lead.source || 'manual'
                }
              });
            }
            return { id: existingLead.id, reentry: true };
          }
        }
      }
      
      const { tag_ids, ...leadData } = lead;
      
      // O trigger enforce_organization_id() vai sobrescrever organization_id
      // mas precisamos incluÃ­-lo para satisfazer o TypeScript
      const insertData = {
        ...leadData,
        organization_id: organizationId!, // SerÃ¡ sobrescrito pelo trigger
        pipeline_id: pipelineId,
        stage_id: stageId,
        source: (lead.source || 'manual') as any,
      };
      
      const { data, error } = await supabase
        .from('leads')
        .insert(insertData)
        .select()
        .single();
      
      if (error) throw error;
      
      // Add tags if provided
      if (tag_ids && tag_ids.length > 0) {
        await supabase
          .from('lead_tags')
          .insert(tag_ids.map(tagId => ({ lead_id: data.id, tag_id: tagId })));
      }
      
      // Vincular conversas WhatsApp existentes ao novo lead
      if (lead.phone) {
        const normalizedPhone = normalizePhone(lead.phone);
        
        if (normalizedPhone) {
          // Buscar conversas sem lead vinculado
          const { data: conversations } = await supabase
            .from('whatsapp_conversations')
            .select('id, contact_phone')
            .is('lead_id', null);
          
          // Atualizar conversas que correspondem ao telefone
          for (const conv of conversations || []) {
            if (conv.contact_phone && normalizePhone(conv.contact_phone) === normalizedPhone) {
              await supabase
                .from('whatsapp_conversations')
                .update({ lead_id: data.id })
                .eq('id', conv.id);
            }
          }
        }
      }
      
      // Log activity: lead created
      await supabase.from('activities').insert({
        lead_id: data.id,
        user_id: user.user.id,
        type: 'lead_created',
        content: `Lead "${lead.name}" foi criado`,
        metadata: { 
          source: lead.source || 'manual',
          origin: 'useCreateLead'
        }
      });
      
      // Audit log: lead created
      logAuditAction(
        'create',
        'lead',
        data.id,
        undefined,
        { name: lead.name, phone: lead.phone, source: lead.source || 'manual' },
        organizationId
      ).catch(console.error);
      
      // Notificar todas as partes interessadas (vendedor, lÃ­deres, admins)
      await notifyLeadCreated({
        leadId: data.id,
        leadName: lead.name,
        organizationId: organizationId,
        pipelineId: pipelineId,
        assignedUserId: lead.assigned_user_id,
        source: lead.source || 'manual',
      });

      // Mensagem de boas-vindas automÃ¡tica DESATIVADA por solicitaÃ§Ã£o do produto.
      // NÃ£o enviar nenhuma mensagem WhatsApp automÃ¡tica ao criar lead.

      
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['stages'] });
      queryClient.invalidateQueries({ queryKey: ['stages-with-leads'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      if (data?.id) {
        queryClient.invalidateQueries({ queryKey: ['lead', data.id] });
        queryClient.invalidateQueries({ queryKey: ['lead-history-v2', data.id] });
      }
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['telecom-customers'] });
      queryClient.invalidateQueries({ queryKey: ['telecom-customer-stats'] });
      if (!data?.reentry) {
        toast.success('Lead criado com sucesso!');
      }
    },
    onError: (error) => {
      const rateLimitMessage = getClientRateLimitMessage(error);
      if (rateLimitMessage) {
        toast.error(rateLimitMessage);
        return;
      }
      toast.error('Erro ao criar lead: ' + error.message);
    },
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Lead> & { id: string }) => {
      const { data: authUser } = await supabase.auth.getUser();
      enforceClientActionRateLimit(`lead:update:${authUser.user?.id || 'anonymous'}:${id}`, [
        { limit: 2, windowMs: 1000 },
        { limit: 30, windowMs: 60_000 },
      ]);

      const updateData: any = { ...updates };
      delete updateData.tags;
      delete updateData.assignee;
      delete updateData.stage;
      
      // Check if this is a stage change
      const isStageChange = !!updates.stage_id;
      
      if (isStageChange) {
        updateData.stage_entered_at = new Date().toISOString();
      }
      
      // Get current lead data for comparison
      const { data: currentLead } = await supabase
        .from('leads')
        .select('id, organization_id, name, assigned_user_id, stage_id')
        .eq('id', id)
        .maybeSingle();
      
      const { error, count } = await supabase
        .from('leads')
        .update(updateData, { count: 'exact' })
        .eq('id', id);
      
      if (error) throw error;
      if (count === 0) {
        throw new Error('Nenhuma alteração foi gravada. Verifique se você tem permissão para editar este lead.');
      }

      const { data: refreshedLead } = await supabase
        .from('leads')
        .select()
        .eq('id', id)
        .maybeSingle();

      const data = (refreshedLead || {
        ...(currentLead || { id }),
        ...updateData,
        id,
      }) as Lead;

      // Audit log: lead updated
      logAuditAction(
        'update',
        'lead',
        id,
        { stage_id: currentLead?.stage_id, assigned_user_id: currentLead?.assigned_user_id, name: currentLead?.name },
        updates,
        data.organization_id || currentLead?.organization_id
      ).catch(console.error);
      
      return data;
    },
    onSuccess: (data) => {
      // SincronizaÃ§Ã£o cirÃºrgica: apenas o necessÃ¡rio
      if (data?.id) {
        queryClient.invalidateQueries({ queryKey: ['lead', data.id] });
        queryClient.invalidateQueries({ queryKey: ['lead-history-v2', data.id] });
      }
      
      // Invalida listas apenas para refletir as mudanÃ§as (usa refetch em background)
      queryClient.invalidateQueries({ queryKey: ['leads'], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['stages-with-leads'], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['activities'], refetchType: 'none' });
    },
    onError: (error) => {
      const rateLimitMessage = getClientRateLimitMessage(error);
      if (rateLimitMessage) {
        toast.error(rateLimitMessage);
        return;
      }
      toast.error('Erro ao atualizar lead: ' + error.message);
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      // Fetch lead data before deleting for audit log
      const { data: leadData } = await supabase
        .from('leads')
        .select('name, phone, organization_id')
        .eq('id', id)
        .single();
      
      // Delete related notifications first to avoid FK constraint violation
      const { error: notifError } = await supabase
        .from('notifications')
        .delete()
        .eq('lead_id', id);
      
      if (notifError) throw notifError;

      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      // Audit log: lead deleted
      if (leadData) {
        logAuditAction(
          'delete',
          'lead',
          id,
          { name: leadData.name, phone: leadData.phone },
          undefined,
          leadData.organization_id || undefined
        ).catch(console.error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['contacts-list'] });
      queryClient.invalidateQueries({ queryKey: ['stages'] });
      queryClient.invalidateQueries({ queryKey: ['stages-with-leads'] });
      toast.success('Contato excluído!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir lead: ' + error.message);
    },
  });
}

export function useAddLeadTag() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ leadId, tagId }: { leadId: string; tagId: string }) => {
      const { data: user } = await supabase.auth.getUser();
      enforceClientActionRateLimit(`lead:tag:add:${user.user?.id || 'anonymous'}:${leadId}`, [
        { limit: 2, windowMs: 1000 },
        { limit: 20, windowMs: 60_000 },
      ]);
      
      // Verificar se a tag jÃ¡ estÃ¡ associada ao lead
      const { data: existingTag } = await supabase
        .from('lead_tags')
        .select('id')
        .eq('lead_id', leadId)
        .eq('tag_id', tagId)
        .maybeSingle();
      
      if (existingTag) {
        throw new Error('TAG_ALREADY_EXISTS');
      }
      
      const { error } = await supabase
        .from('lead_tags')
        .insert({ lead_id: leadId, tag_id: tagId });
      
      if (error) throw error;
      
      // Log activity
      if (user?.user?.id) {
        const { data: tag } = await supabase
          .from('tags')
          .select('name')
          .eq('id', tagId)
          .single();
        
        await supabase.from('activities').insert({
          lead_id: leadId,
          user_id: user.user.id,
          type: 'tag_added',
          content: `Tag "${tag?.name || 'Desconhecida'}" adicionada`,
          metadata: { tag_id: tagId, tag_name: tag?.name }
        });
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead'] });
      queryClient.invalidateQueries({ queryKey: ['stages'] });
      queryClient.invalidateQueries({ queryKey: ['stages-with-leads'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      queryClient.invalidateQueries({ queryKey: ['conversation-lead-detail'] });
      queryClient.invalidateQueries({ queryKey: ['lead-history-v2', variables.leadId] });
      toast.success('Tag adicionada!');
    },
    onError: (error: any) => {
      const rateLimitMessage = getClientRateLimitMessage(error);
      if (rateLimitMessage) {
        toast.error(rateLimitMessage);
        return;
      }
      if (error.message === 'TAG_ALREADY_EXISTS' || error.message?.includes('unique constraint')) {
        toast.info('Esta tag já está adicionada ao lead');
      } else {
        toast.error('Erro ao adicionar tag: ' + error.message);
      }
    },
  });
}

export function useRemoveLeadTag() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ leadId, tagId }: { leadId: string; tagId: string }) => {
      const { data: user } = await supabase.auth.getUser();
      enforceClientActionRateLimit(`lead:tag:remove:${user.user?.id || 'anonymous'}:${leadId}`, [
        { limit: 2, windowMs: 1000 },
        { limit: 20, windowMs: 60_000 },
      ]);
      
      // Get tag name before deleting
      const { data: tag } = await supabase
        .from('tags')
        .select('name')
        .eq('id', tagId)
        .single();
      
      const { error } = await supabase
        .from('lead_tags')
        .delete()
        .eq('lead_id', leadId)
        .eq('tag_id', tagId);
      
      if (error) throw error;
      
      // Log activity
      if (user?.user?.id) {
        await supabase.from('activities').insert({
          lead_id: leadId,
          user_id: user.user.id,
          type: 'tag_removed',
          content: `Tag "${tag?.name || 'Desconhecida'}" removida`,
          metadata: { tag_id: tagId, tag_name: tag?.name }
        });
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead'] });
      queryClient.invalidateQueries({ queryKey: ['stages'] });
      queryClient.invalidateQueries({ queryKey: ['stages-with-leads'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      queryClient.invalidateQueries({ queryKey: ['conversation-lead-detail'] });
      queryClient.invalidateQueries({ queryKey: ['lead-history-v2', variables.leadId] });
      toast.success('Tag removida!');
    },
    onError: (error) => {
      const rateLimitMessage = getClientRateLimitMessage(error);
      if (rateLimitMessage) {
        toast.error(rateLimitMessage);
        return;
      }
      toast.error('Erro ao remover tag: ' + error.message);
    },
  });
}
