-- Additive support for Evolution Go reactions and provider metadata.
-- This does not change existing Evolution rows or RLS policies.

alter table public.whatsapp_messages
  add column if not exists reaction_to_message_id text,
  add column if not exists reaction_emoji text,
  add column if not exists reaction_sender_jid text,
  add column if not exists reaction_sender_name text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_whatsapp_messages_reaction_to
  on public.whatsapp_messages (session_id, reaction_to_message_id)
  where reaction_to_message_id is not null;

create index if not exists idx_whatsapp_messages_remote_jid
  on public.whatsapp_messages (session_id, remote_jid)
  where remote_jid is not null;
