-- Appointment reminders must notify CRM users only.
-- Leads/customers should never receive automatic agenda reminders by WhatsApp.

update public.notification_templates
set
  channel = 'system',
  channels = array['system']::text[],
  title = 'Lembrete de compromisso',
  message = 'Lembrete de compromisso: {titulo} as {horario} com o lead {nome_lead}.',
  variables = array['titulo', 'horario', 'nome_lead', 'minutos']::text[],
  dedupe_window_seconds = 300,
  updated_at = now()
where slug = 'appointment_reminder'
   or event_key = 'appointment_reminder';
