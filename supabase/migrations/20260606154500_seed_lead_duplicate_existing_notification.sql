insert into public.notification_templates
  (name, slug, category, event_key, channel, channels, title, message, variables, is_active, editable_by_admin, dedupe_window_seconds, subject, html_body)
values
  (
    'Lead já cadastrado',
    'lead_duplicate_existing',
    'lead',
    'lead_duplicate_existing',
    'system',
    array['system', 'push']::text[],
    'Lead já cadastrado',
    'O lead {lead_name} já está cadastrado com {assignee_name}. O card foi atualizado no funil.',
    array['lead_name', 'assignee_name']::text[],
    true,
    true,
    120,
    null,
    null
  )
on conflict (slug) do update set
  name = excluded.name,
  category = excluded.category,
  event_key = excluded.event_key,
  channel = excluded.channel,
  channels = excluded.channels,
  title = excluded.title,
  message = excluded.message,
  variables = excluded.variables,
  is_active = excluded.is_active,
  editable_by_admin = excluded.editable_by_admin,
  dedupe_window_seconds = excluded.dedupe_window_seconds,
  updated_at = now();
