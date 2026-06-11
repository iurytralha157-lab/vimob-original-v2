import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { getNotificationRoute } from '@/lib/notification-routing';

// Global AudioContext for reliable sound playback
let globalAudioContext: AudioContext | null = null;
let notificationBuffer: AudioBuffer | null = null;
let newLeadBuffer: AudioBuffer | null = null;
let audioInitialized = false;

// Initialize AudioContext and load sounds
async function initializeAudio(): Promise<void> {
  if (audioInitialized) return;
  
  try {
    // Create AudioContext (needs user interaction to start)
    globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Load and decode audio files
    const loadAudioBuffer = async (url: string): Promise<AudioBuffer | null> => {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return await globalAudioContext!.decodeAudioData(arrayBuffer);
      } catch (err) {
        console.error('Failed to load audio:', url, err);
        return null;
      }
    };

    // Load both sounds in parallel
    const [notifBuffer, leadBuffer] = await Promise.all([
      loadAudioBuffer('/sounds/notification.mp3'),
      loadAudioBuffer('/sounds/new-lead.mp3'),
    ]);

    notificationBuffer = notifBuffer;
    newLeadBuffer = leadBuffer;
    audioInitialized = true;
    
    console.log('🔊 Audio system initialized successfully');
  } catch (err) {
    console.error('Failed to initialize audio:', err);
  }
}

// Resume AudioContext if suspended (required after page navigation)
async function resumeAudioContext(): Promise<void> {
  if (globalAudioContext?.state === 'suspended') {
    try {
      await globalAudioContext.resume();
      console.log('🔊 AudioContext resumed');
    } catch (err) {
      console.error('Failed to resume AudioContext:', err);
    }
  }
}

// Play sound using Web Audio API (much more reliable)
function playSound(type: 'notification' | 'new-lead', volume: number = 0.7): void {
  if (!globalAudioContext || !audioInitialized) {
    console.warn('🔇 Audio not initialized yet');
    return;
  }

  const buffer = type === 'new-lead' ? newLeadBuffer : notificationBuffer;
  if (!buffer) {
    console.warn('🔇 Audio buffer not loaded for:', type);
    return;
  }

  try {
    // Resume if needed
    if (globalAudioContext.state === 'suspended') {
      globalAudioContext.resume();
    }

    // Create buffer source
    const source = globalAudioContext.createBufferSource();
    source.buffer = buffer;

    // Create gain node for volume control
    const gainNode = globalAudioContext.createGain();
    gainNode.gain.value = volume;

    // Connect: source -> gain -> destination
    source.connect(gainNode);
    gainNode.connect(globalAudioContext.destination);

    // Play
    source.start(0);
    console.log('✅ Sound played:', type);
  } catch (err) {
    console.error('❌ Failed to play sound:', err);
  }
}

export interface Notification {
  id: string;
  user_id: string;
  organization_id: string;
  title: string;
  content: string | null;
  type: string;
  is_read: boolean;
  lead_id: string | null;
  created_at: string;
}

// Notification permission request logic removed as push is disabled
async function requestNotificationPermission(): Promise<boolean> {
  return false;
}

// Send browser notification logic removed as push is disabled
function sendBrowserNotification(title: string, options?: NotificationOptions) {
  // Push disabled globally
  console.log('Browser notification suppressed (push disabled):', title);
}

export function useNotifications() {
  const queryClient = useQueryClient();
  const { profile, organization } = useAuth();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const audioSetupDone = useRef(false);
  const notifyAfterRef = useRef(Date.now());

  // Initialize audio on first user interaction
  useEffect(() => {
    if (audioSetupDone.current) return;
    
    const handleInteraction = async () => {
      if (audioSetupDone.current) return;
      audioSetupDone.current = true;
      
      // Remove listeners immediately
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
      
      // Initialize audio system
      await initializeAudio();
      
      // Request notification permission
      await requestNotificationPermission();
    };

    document.addEventListener('click', handleInteraction);
    document.addEventListener('keydown', handleInteraction);
    document.addEventListener('touchstart', handleInteraction);

    // Also try to resume on visibility change (tab focus)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        resumeAudioContext();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Play notification sound - exposed for manual trigger if needed
  const playNotificationSound = useCallback((type: 'notification' | 'new-lead' = 'notification') => {
    const volume = type === 'new-lead' ? 0.7 : 0.5;
    playSound(type, volume);
  }, []);

  // Subscribe to realtime notifications with exponential backoff
  useEffect(() => {
    if (!profile?.id || !organization?.id) return;
    notifyAfterRef.current = Date.now();

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const baseDelay = 1000;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isUnmounting = false;

    const isFreshRealtimeInsert = (createdAt?: string | null) => {
      if (!createdAt) return true;
      const createdTime = Date.parse(createdAt);
      if (Number.isNaN(createdTime)) return true;
      return createdTime >= notifyAfterRef.current - 5000;
    };

    const setupChannel = () => {
      if (isUnmounting) return;
      
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      console.log('📡 Setting up notifications realtime channel for user:', profile.id, 'org:', organization.id);

      const channel = supabase
        .channel(`notifications-realtime-v6-${profile.id}-${organization.id}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${profile.id}`,
          },
          (payload) => {
            const newNotification = payload.new as Notification;
            
            // Only process notifications for the current organization
            if (newNotification.organization_id !== organization.id) {
              console.log('⏭️ Notification for different organization ignored:', newNotification.organization_id);
              return;
            }

            console.log('🔔 New notification received via Realtime:', payload);
            const shouldAlertUser = isFreshRealtimeInsert(newNotification.created_at);

            // Skip WhatsApp message notifications (silent)
            const isWhatsAppNotification = newNotification.type === 'whatsapp' || newNotification.type === 'message';
            const isLeadNotification = newNotification.type === 'lead' || newNotification.type === 'new_lead';
            const notificationRoute = getNotificationRoute(newNotification);
            const toastAction = notificationRoute
              ? {
                  label: 'Abrir',
                  onClick: () => window.location.assign(notificationRoute),
                }
              : undefined;
            
            if (!shouldAlertUser) {
              console.log('Skipping old realtime notification alert:', newNotification.title);
            } else if (isWhatsAppNotification) {
              console.log('💬 WhatsApp notification (silent):', newNotification.title);
            } else if (isLeadNotification) {
              // New lead - play cha-ching sound
              console.log('🆕 Playing new-lead sound for:', newNotification.title);
              playSound('new-lead', 0.7);
              
              toast.success('Novo Lead Recebido', {
                description: newNotification.content || newNotification.title,
                duration: 10000,
                action: toastAction,
              });
            } else {
              // Other important notifications (financial, system, etc.)
              console.log('🔔 Playing notification sound for:', newNotification.title);
              playSound('notification', 0.5);
              
              toast(newNotification.title, {
                description: newNotification.content || undefined,
                duration: 5000,
                action: toastAction,
              });
            }

            if (shouldAlertUser) {
              sendBrowserNotification(newNotification.title, {
                body: newNotification.content || undefined,
                data: { lead_id: newNotification.lead_id },
              });
            }

            queryClient.invalidateQueries({ queryKey: ['notifications'] });
            queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
            
            if (isLeadNotification) {
              queryClient.invalidateQueries({ queryKey: ['leads'] });
              queryClient.invalidateQueries({ queryKey: ['stages-with-leads'] });
              queryClient.invalidateQueries({ queryKey: ['pipelines'] });
              queryClient.invalidateQueries({ queryKey: ['contacts-list'] });
            }
          }
        )
        .subscribe((status) => {
          console.log('📡 Notifications channel status:', status);
          
          if (status === 'SUBSCRIBED') {
            reconnectAttempts = 0;
            notifyAfterRef.current = Date.now();
            console.log('Realtime notifications connected successfully');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            if (isUnmounting) return;
            
            if (reconnectAttempts < maxReconnectAttempts) {
              reconnectAttempts++;
              // Exponential backoff: 1s, 2s, 4s, 8s, 16s
              const delay = baseDelay * Math.pow(2, reconnectAttempts - 1);
              console.warn(`Realtime channel error, reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
              
              reconnectTimeout = setTimeout(() => {
                if (!isUnmounting) setupChannel();
              }, delay);
            } else {
              console.error('Max reconnection attempts reached. Falling back to polling only.');
            }
          } else if (status === 'CLOSED') {
            if (!isUnmounting) {
              console.debug('Notifications realtime channel closed');
            }
          }
        });

      channelRef.current = channel;
    };

    setupChannel();

    return () => {
      isUnmounting = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (channelRef.current) {
        console.log('🔌 Disconnecting notifications channel');
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [profile?.id, organization?.id, queryClient]);

  const query = useQuery({
    queryKey: ['notifications', profile?.id, organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile!.id)
        .eq('organization_id', organization!.id)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as Notification[];
    },
    enabled: !!profile?.id,
    refetchInterval: 30000,
  });

  return {
    ...query,
    playNotificationSound,
  };
}

export function useUnreadNotificationsCount() {
  const queryClient = useQueryClient();
  const { profile, organization } = useAuth();

  useEffect(() => {
    if (!profile?.id || !organization?.id) return;

    const channel = supabase
      .channel(`notifications-count-realtime-${profile.id}-${organization.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          // Only invalidate if the notification belongs to current organization
          const notification = payload.new as any;
          if (!notification || notification.organization_id === organization.id) {
            queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, organization?.id, queryClient]);

  return useQuery({
    queryKey: ['unread-notifications-count', profile?.id, organization?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile!.id)
        .eq('organization_id', organization!.id)
        .eq('is_read', false);
      
      if (error) throw error;
      return count || 0;
    },
    enabled: !!profile?.id && !!organization?.id,
    refetchInterval: 30000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const { organization } = useAuth();
  
  return useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user || !organization?.id) return;
      
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.user.id)
        .eq('organization_id', organization.id)
        .eq('is_read', false);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
    },
  });
}

export function useCreateNotification() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (notification: {
      user_id: string;
      organization_id: string;
      title: string;
      content?: string;
      type?: string;
      lead_id?: string;
    }) => {
      const { data, error } = await supabase
        .from('notifications')
        .insert({
          user_id: notification.user_id,
          organization_id: notification.organization_id,
          title: notification.title,
          content: notification.content || null,
          type: notification.type || 'info',
          lead_id: notification.lead_id || null,
          is_read: false,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
    },
  });
}
