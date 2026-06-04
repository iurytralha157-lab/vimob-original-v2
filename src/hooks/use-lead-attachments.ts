import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { enforceClientActionRateLimit, getClientRateLimitMessage } from '@/lib/client-action-rate-limit';
import { toast } from 'sonner';

export interface LeadAttachment {
  id: string;
  lead_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  created_by: string | null;
  message_id: string | null;
}

export function useLeadAttachments(leadId: string | null) {
  return useQuery({
    queryKey: ['lead-attachments', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      const { data, error } = await (supabase as any)
        .from('lead_attachments')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as LeadAttachment[];
    },
    enabled: !!leadId,
  });
}

export function useCreateLeadAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (attachment: {
      lead_id: string;
      file_name: string;
      file_url: string;
      file_type?: string;
      file_size?: number;
      message_id?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      enforceClientActionRateLimit(`lead:attachment:create:${user?.id || 'anonymous'}:${attachment.lead_id}`, [
        { limit: 2, windowMs: 1000 },
        { limit: 20, windowMs: 60_000 },
      ]);

      if (attachment.message_id) {
        const { data: existing, error: existingError } = await (supabase as any)
          .from('lead_attachments')
          .select('id')
          .eq('lead_id', attachment.lead_id)
          .eq('message_id', attachment.message_id)
          .maybeSingle();

        if (existingError) throw existingError;
        if (existing) return existing;
      }
      
      const { data, error } = await (supabase as any)
        .from('lead_attachments')
        .insert({
          ...attachment,
          created_by: user?.id
        })
        .select()
        .single();

      if (error) throw error;

      await (supabase as any).from('activities').insert({
        lead_id: attachment.lead_id,
        user_id: user?.id,
        type: 'note',
        content: `Documento anexado: ${attachment.file_name}`,
        metadata: {
          file_url: attachment.file_url,
          file_type: attachment.file_type,
          file_size: attachment.file_size,
          message_id: attachment.message_id,
        },
      });

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead-attachments', variables.lead_id] });
      queryClient.invalidateQueries({ queryKey: ['activities', variables.lead_id] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      queryClient.invalidateQueries({ queryKey: ['recent-activities'] });
      queryClient.invalidateQueries({ queryKey: ['lead-history-v2', variables.lead_id] });
      toast.success('Documento anexado com sucesso!');
    },
    onError: (error) => {
      console.error('Error creating attachment:', error);
      const rateLimitMessage = getClientRateLimitMessage(error);
      toast.error(rateLimitMessage || 'Erro ao anexar documento');
    }
  });
}
