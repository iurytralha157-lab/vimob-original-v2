import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { notificationService } from '@/services/NotificationService';
import { useAuth } from '@/contexts/AuthContext';

interface Announcement {
  id: string;
  message: string;
  button_text: string | null;
  button_url: string | null;
  is_active: boolean;
  show_banner: boolean;
  send_notification: boolean;
  target_type: string;
  target_organization_ids: string[] | null;
  target_user_ids: string[] | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
}

interface PublishAnnouncementParams {
  message: string;
  buttonText?: string;
  buttonUrl?: string;
  showBanner?: boolean;
  sendNotification?: boolean;
  targetType?: 'all' | 'organizations' | 'admins' | 'specific';
  targetOrganizationIds?: string[];
  targetUserIds?: string[];
}

// Hook para buscar o comunicado ativo (para todos os usuários)
export function useActiveAnnouncement() {
  const { profile, organization } = useAuth();

  return useQuery({
    queryKey: ['active-announcement', profile?.id, profile?.role, organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .eq('show_banner', true)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      const currentUserId = profile?.id;
      const currentOrgId = organization?.id || profile?.organization_id;
      const currentRole = profile?.role;
      const announcements = (data || []) as Announcement[];

      return announcements.find((announcement) => {
        if (announcement.target_type === 'all') return true;
        if (announcement.target_type === 'admins') return currentRole === 'admin' || currentRole === 'super_admin';
        if (announcement.target_type === 'organizations') return !!currentOrgId && (announcement.target_organization_ids || []).includes(currentOrgId);
        if (announcement.target_type === 'specific') return !!currentUserId && (announcement.target_user_ids || []).includes(currentUserId);
        return false;
      }) || null;
    },
    enabled: !!profile?.id,
    staleTime: 1000 * 60 * 5, // 5 minutos
    gcTime: 1000 * 60 * 10,
  });
}

// Hook para gerenciar comunicados (para super admins)
export function useAnnouncements() {
  const queryClient = useQueryClient();

  // Fetch current active announcement
  const { data: currentAnnouncement, isLoading: isLoadingCurrent } = useQuery({
    queryKey: ['active-announcement-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();
      
      if (error) throw error;
      return data as Announcement | null;
    },
  });

  // Fetch all announcements for history
  const { data: allAnnouncements, isLoading: isLoadingAll } = useQuery({
    queryKey: ['all-announcements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data as Announcement[];
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (params: PublishAnnouncementParams) => {
      const {
        message,
        buttonText,
        buttonUrl,
        showBanner = true,
        sendNotification = true,
        targetType = 'all',
        targetOrganizationIds = [],
        targetUserIds = [],
      } = params;

      // 1. Desativar comunicados anteriores
      await supabase
        .from('announcements')
        .update({ is_active: false })
        .eq('is_active', true);

      // 2. Criar novo comunicado
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data: announcement, error } = await supabase
        .from('announcements')
        .insert({
          message,
          button_text: buttonText || null,
          button_url: buttonUrl || null,
          is_active: true,
          show_banner: showBanner,
          send_notification: sendNotification,
          target_type: targetType,
          target_organization_ids: targetOrganizationIds.length > 0 ? targetOrganizationIds : null,
          target_user_ids: targetUserIds.length > 0 ? targetUserIds : null,
          created_by: user?.id || null,
        })
        .select()
        .single();

      if (error) throw error;

      // 3. Enviar notificações se habilitado
      if (sendNotification) {
        let usersToNotify: { id: string; organization_id: string | null }[] = [];

        if (targetType === 'all') {
          // Todos os usuários ativos
          const { data: users } = await supabase
            .from('users')
            .select('id, organization_id')
            .eq('is_active', true);
          usersToNotify = users || [];
        } else if (targetType === 'admins') {
          // Apenas administradores
          const { data: users } = await supabase
            .from('users')
            .select('id, organization_id')
            .eq('is_active', true)
            .eq('role', 'admin');
          usersToNotify = users || [];
        } else if (targetType === 'organizations' && targetOrganizationIds.length > 0) {
          // Usuários de organizações específicas
          const { data: users } = await supabase
            .from('users')
            .select('id, organization_id')
            .eq('is_active', true)
            .in('organization_id', targetOrganizationIds);
          usersToNotify = users || [];
        } else if (targetType === 'specific' && targetUserIds.length > 0) {
          // Usuários específicos
          usersToNotify = targetUserIds.map(id => ({ id, organization_id: null }));
        }

        if (usersToNotify.length > 0) {
          const notifications = usersToNotify.map(user => ({
            user_id: user.id,
            organization_id: user.organization_id,
            title: '📢 Comunicado',
            content: message,
            type: 'system',
          }));

          // Using NotificationService for auditability
          for (const user of usersToNotify) {
            await notificationService.send({
              eventKey: 'system_announcement',
              templateSlug: 'system_announcement',
              dedupeKey: `announcement:${announcement.id}:${user.id}`,
              organizationId: user.organization_id || targetOrganizationIds[0] || '',
              userId: user.id,
              variables: {
                message: message
              }
            });
          }
        }
      }

      return announcement;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-announcement'] });
      queryClient.invalidateQueries({ queryKey: ['active-announcement-admin'] });
      queryClient.invalidateQueries({ queryKey: ['all-announcements'] });
      toast.success('Comunicado publicado!');
    },
    onError: (error: any) => {
      toast.error('Erro ao publicar: ' + error.message);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (announcementId: string) => {
      const { error } = await supabase
        .from('announcements')
        .update({ is_active: false })
        .eq('id', announcementId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-announcement'] });
      queryClient.invalidateQueries({ queryKey: ['active-announcement-admin'] });
      queryClient.invalidateQueries({ queryKey: ['all-announcements'] });
      toast.success('Comunicado desativado!');
    },
    onError: (error: any) => {
      toast.error('Erro ao desativar: ' + error.message);
    },
  });

  return {
    currentAnnouncement,
    allAnnouncements,
    isLoading: isLoadingCurrent || isLoadingAll,
    publish: publishMutation,
    deactivate: deactivateMutation,
  };
}
