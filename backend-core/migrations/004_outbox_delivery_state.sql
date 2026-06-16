alter table outbox_messages
  add column if not exists provider_message_id text not null default '',
  add column if not exists sent_at timestamptz;

create index if not exists idx_outbox_channel_status_scheduled
  on outbox_messages (channel, status, scheduled_at);
