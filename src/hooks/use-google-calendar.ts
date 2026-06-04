import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface GoogleCalendarToken {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  calendar_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useGoogleCalendarStatus() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['google-calendar-status', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;

      const { data, error } = await supabase
        .from('google_calendar_tokens')
        .select('*')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data as GoogleCalendarToken | null;
    },
    enabled: !!profile?.id,
  });
}

export function useConnectGoogleCalendar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Get the current URL to redirect back after OAuth
      const returnUrl = window.location.href;
      
      // This will trigger the OAuth flow via edge function
      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        body: { action: 'connect', returnUrl },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.authUrl) {
        // Open Google OAuth in same window (will redirect back after auth)
        window.location.href = data.authUrl;
      }
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
    },
    onError: (error) => {
      console.error('Error connecting Google Calendar:', error);
      toast.error('Erro ao conectar Google Calendar');
    },
  });
}

export function useDisconnectGoogleCalendar() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error('Usuário não encontrado');

      const { error } = await supabase
        .from('google_calendar_tokens')
        .delete()
        .eq('user_id', profile.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
      toast.success('Google Calendar desconectado');
    },
    onError: (error) => {
      console.error('Error disconnecting Google Calendar:', error);
      toast.error('Erro ao desconectar Google Calendar');
    },
  });
}

export function useToggleGoogleCalendarSync() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (calendar_id: string) => {
      if (!profile?.id) throw new Error('Usuário não encontrado');

      const { data, error } = await supabase
        .from('google_calendar_tokens')
        .update({ calendar_id })
        .eq('user_id', profile.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
      toast.success('Calendário atualizado');
    },
    onError: (error) => {
      console.error('Error toggling sync:', error);
      toast.error('Erro ao atualizar calendário');
    },
  });
}
