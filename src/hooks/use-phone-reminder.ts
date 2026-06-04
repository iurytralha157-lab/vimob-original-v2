import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { notificationService } from '@/services/NotificationService';

export function usePhoneReminder() {
  const { profile } = useAuth();

  useEffect(() => {
    if (!profile?.id || !profile?.organization_id) return;
    
    // Importante: se whatsapp for undefined, significa que o perfil completo ainda está carregando
    // Não devemos disparar o lembrete antes de termos certeza que o campo está vazio
    if (profile.whatsapp === undefined) return;
    if (profile.whatsapp && profile.whatsapp.trim() !== '') return;

    const storageKey = `phone_reminder_shown_${profile.id}_${new Date().toDateString()}`;
    if (localStorage.getItem(storageKey)) return;

    const createReminder = async () => {
      try {
        await notificationService.send({
          templateSlug: 'update_phone_reminder',
          organizationId: profile.organization_id,
          userId: profile.id,
          variables: {
            user_name: profile.name
          }
        });
        localStorage.setItem(storageKey, 'true');
      } catch (error) {
        console.error('Erro ao criar lembrete de telefone:', error);
      }
    };

    createReminder();
  }, [profile?.id, profile?.organization_id, profile?.whatsapp]);
}
