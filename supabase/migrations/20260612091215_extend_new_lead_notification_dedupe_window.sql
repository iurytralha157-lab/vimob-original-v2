update public.notification_templates
set
  dedupe_window_seconds = 31536000,
  updated_at = now()
where event_key = 'new_lead_received'
   or slug = 'new_lead_received';
