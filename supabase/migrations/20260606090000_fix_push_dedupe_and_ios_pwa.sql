-- Prevent duplicate push notifications when a template creates an in-app
-- notification and also declares an explicit push channel.
--
-- The trigger trigger_push_on_notification_insert already sends Web Push for
-- every inserted row in public.notifications. For templates that include the
-- system channel, keeping push in channels makes the same event reach the
-- device twice: once through the trigger and once through notification-dispatcher.

update public.notification_templates
set
  channels = array_remove(channels, 'push'),
  updated_at = now()
where channels is not null
  and 'system' = any(channels)
  and 'push' = any(channels);

