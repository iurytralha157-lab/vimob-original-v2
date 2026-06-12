import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const VAPID_PUBLIC_KEY = 'BC7q4HGKxwbHnzRl0uBTyTOm59GcEyxqM8fgSTGiSfNoxwYIIy8-HnbbpzQghQUzpzPmmifvn9t01EoTJaFa3uQ';

export const usePushNotifications = () => {
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
      
      navigator.serviceWorker.ready.then(registration => {
        registration.pushManager.getSubscription().then(sub => {
          setSubscription(sub);
        });
      });
    }
  }, []);

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const subscribeUser = async () => {
    try {
      if (!isSupported) return;

      const result = await Notification.requestPermission();
      setPermission(result);

      if (result !== 'granted') {
        throw new Error('Permission not granted for notifications');
      }

      const registration = await navigator.serviceWorker.ready;
      
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      setSubscription(sub);

      // Save to Supabase
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('organization_id')
          .eq('id', user.id)
          .single();

        if (userError || !userData?.organization_id) {
          console.error('Error loading user organization for push subscription:', userError);
          return sub;
        }

        const token = JSON.stringify(sub.toJSON());
        const { error } = await (supabase as any)
          .from('push_tokens')
          .upsert({
            user_id: user.id,
            organization_id: userData.organization_id,
            token,
            platform: 'web',
            is_active: true,
          }, { onConflict: 'user_id,token' });

        if (error) console.error('Error saving subscription to Supabase:', error);
      }

      return sub;
    } catch (err) {
      console.error('Failed to subscribe the user: ', err);
    }
  };

  const unsubscribeUser = async () => {
    try {
      if (subscription) {
        await subscription.unsubscribe();
        setSubscription(null);
        
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const token = JSON.stringify(subscription.toJSON());
          await (supabase as any)
            .from('push_tokens')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .eq('platform', 'web')
            .eq('token', token);
        }
      }
    } catch (err) {
      console.error('Error unsubscribing', err);
    }
  };

  return {
    isSupported,
    permission,
    subscription,
    subscribeUser,
    unsubscribeUser
  };
};
