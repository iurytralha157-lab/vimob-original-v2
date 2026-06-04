import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

// Type definitions for Capacitor Push Notifications
interface PushNotificationToken {
  value: string;
}

interface PushNotificationActionPerformed {
  actionId: string;
  notification: {
    title?: string;
    body?: string;
    data?: Record<string, any>;
  };
}

interface PushNotificationReceived {
  title?: string;
  body?: string;
  data?: Record<string, any>;
}

interface CapacitorPushNotifications {
  requestPermissions(): Promise<{ receive: 'granted' | 'denied' | 'prompt' }>;
  register(): Promise<void>;
  addListener(event: 'registration', callback: (token: PushNotificationToken) => void): Promise<{ remove: () => void }>;
  addListener(event: 'registrationError', callback: (error: any) => void): Promise<{ remove: () => void }>;
  addListener(event: 'pushNotificationReceived', callback: (notification: PushNotificationReceived) => void): Promise<{ remove: () => void }>;
  addListener(event: 'pushNotificationActionPerformed', callback: (action: PushNotificationActionPerformed) => void): Promise<{ remove: () => void }>;
  removeAllListeners(): Promise<void>;
}

// Check if running in Capacitor native environment
function isCapacitorNative(): boolean {
  return typeof window !== 'undefined' && 
         (window as any).Capacitor?.isNativePlatform?.() === true;
}

// Get platform name
function getPlatform(): 'android' | 'ios' | 'web' {
  if (!isCapacitorNative()) return 'web';
  const platform = (window as any).Capacitor?.getPlatform?.();
  return platform === 'ios' ? 'ios' : 'android';
}

// Dynamically import Capacitor Push Notifications
async function getPushNotificationsPlugin(): Promise<CapacitorPushNotifications | null> {
  if (!isCapacitorNative()) {
    console.log('[Push] Not running in Capacitor native environment');
    return null;
  }

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    return PushNotifications as CapacitorPushNotifications;
  } catch (error) {
    console.error('[Push] Failed to import Capacitor Push Notifications:', error);
    return null;
  }
}

export function usePushNotifications() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const initialized = useRef(false);
  const currentToken = useRef<string | null>(null);

  // Save token to database
  const saveToken = useCallback(async (token: string) => {
    if (!profile?.id || !profile?.organization_id) {
      console.log('[Push] No user profile, skipping token save');
      return;
    }

    const platform = getPlatform();

    try {
      // Upsert token (update if exists, insert if not)
      const { error } = await supabase
        .from('push_tokens')
        .upsert(
          {
            user_id: profile.id,
            organization_id: profile.organization_id,
            token: token,
            platform: platform,
            device_info: {
              userAgent: navigator.userAgent,
              timestamp: new Date().toISOString(),
            },
            is_active: true,
          },
          {
            onConflict: 'user_id,token',
          }
        );

      if (error) {
        console.error('[Push] Error saving token:', error);
      } else {
        console.log('[Push] Token saved successfully');
        currentToken.current = token;
      }
    } catch (error) {
      console.error('[Push] Error saving token:', error);
    }
  }, [profile?.id, profile?.organization_id]);

  // Handle notification click (navigation)
  const handleNotificationAction = useCallback((data: Record<string, any>) => {
    console.log('[Push] Notification clicked, data:', data);

    const leadId = data?.lead_id;
    const type = data?.type;

    if (leadId) {
      // Navigate to lead detail or relevant page
      navigate('/crm/pipelines', { state: { openLeadId: leadId } });
    } else if (type === 'commission' || type === 'financial') {
      navigate('/financial/dashboard');
    } else if (type === 'task') {
      navigate('/agenda');
    } else {
      // Default: go to notifications page
      navigate('/notifications');
    }
  }, [navigate]);

  // Initialize push notifications
  const initializePush = useCallback(async () => {
    if (initialized.current) return;
    if (!profile?.id) return;

    const PushNotifications = await getPushNotificationsPlugin();
    if (!PushNotifications) {
      console.log('[Push] Push notifications not available');
      return;
    }

    console.log('[Push] Initializing push notifications...');
    initialized.current = true;

    try {
      // Request permission
      const permResult = await PushNotifications.requestPermissions();
      console.log('[Push] Permission result:', permResult.receive);

      if (permResult.receive !== 'granted') {
        console.log('[Push] Permission not granted');
        return;
      }

      // Register with FCM/APNs
      await PushNotifications.register();

      // Listen for registration success
      await PushNotifications.addListener('registration', (token) => {
        console.log('[Push] Registered with token:', token.value.substring(0, 20) + '...');
        saveToken(token.value);
      });

      // Listen for registration errors
      await PushNotifications.addListener('registrationError', (error) => {
        console.error('[Push] Registration error:', error);
      });

      // Listen for push received (foreground)
      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('[Push] Notification received in foreground:', notification.title);
        // Foreground notifications are handled by the in-app notification system
        // We don't need to do anything special here
      });

      // Listen for notification action (user tapped notification)
      await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('[Push] Notification action:', action.actionId);
        handleNotificationAction(action.notification.data || {});
      });

      console.log('[Push] Push notifications initialized successfully');
    } catch (error) {
      console.error('[Push] Initialization error:', error);
      initialized.current = false;
    }
  }, [profile?.id, saveToken, handleNotificationAction]);

  // Deactivate token on logout
  const deactivateToken = useCallback(async () => {
    if (!currentToken.current || !profile?.id) return;

    try {
      await supabase
        .from('push_tokens')
        .update({ is_active: false })
        .eq('user_id', profile.id)
        .eq('token', currentToken.current);

      console.log('[Push] Token deactivated');
      currentToken.current = null;
    } catch (error) {
      console.error('[Push] Error deactivating token:', error);
    }
  }, [profile?.id]);

  // Initialize on mount
  useEffect(() => {
    if (!isCapacitorNative()) {
      console.log('[Push] Web environment, skipping push initialization');
      return;
    }

    initializePush();

    return () => {
      // Cleanup listeners on unmount
      getPushNotificationsPlugin().then((PushNotifications) => {
        PushNotifications?.removeAllListeners();
      });
    };
  }, [initializePush]);

  return {
    isNative: isCapacitorNative(),
    platform: getPlatform(),
    deactivateToken,
  };
}
