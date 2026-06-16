alter table outbox_messages
  add column if not exists campaign_id uuid references campaigns(id) on delete set null;

create unique index if not exists idx_outbox_campaign_channel_recipient_once
  on outbox_messages (campaign_id, channel, recipient)
  where campaign_id is not null;
