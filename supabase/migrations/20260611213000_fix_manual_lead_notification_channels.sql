update public.notification_templates
set
  channels = array['system', 'whatsapp']::text[],
  channel = 'whatsapp'
where event_key = 'manual_lead_registered'
   or slug = 'manual_lead_registered';
