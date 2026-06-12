-- Jhenny needs a small durable memory per WhatsApp conversation.
-- The legacy ai_agent_conversations table is still used by ai-agent-responder,
-- so keep the change local to that table instead of introducing another path.

alter table public.ai_agent_conversations
  add column if not exists memory_summary text not null default '',
  add column if not exists last_user_message_at timestamptz,
  add column if not exists last_ai_message_at timestamptz,
  add column if not exists last_human_message_at timestamptz,
  add column if not exists handoff_reason text,
  add column if not exists last_property_id uuid references public.properties(id) on delete set null,
  add column if not exists last_property_code text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_ai_agent_conversations_updated_at
  on public.ai_agent_conversations(updated_at desc);

create index if not exists idx_ai_agent_conversations_lead_status
  on public.ai_agent_conversations(lead_id, status);

create table if not exists public.outbox_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.whatsapp_sessions(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  content text not null,
  message_type text default 'text',
  media_url text,
  media_base64 text,
  media_mime_type text,
  media_filename text,
  status text default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts int default 0,
  max_attempts int default 3,
  error_message text,
  sent_message_id text,
  created_at timestamptz default now(),
  processed_at timestamptz,
  created_by uuid references public.users(id),
  client_message_id text
);

alter table public.outbox_messages
  add column if not exists client_message_id text;

create index if not exists idx_outbox_messages_client_message_id
  on public.outbox_messages(client_message_id)
  where client_message_id is not null;

create index if not exists idx_outbox_pending
  on public.outbox_messages(status, created_at)
  where status = 'pending';

create index if not exists idx_outbox_session
  on public.outbox_messages(session_id);

alter table public.outbox_messages enable row level security;

grant select, insert, update on table public.outbox_messages to authenticated;
grant all on table public.outbox_messages to service_role;

do $$
begin
  if to_regprocedure('public.auth_org_id()') is not null then
    drop policy if exists "Users can view own org outbox" on public.outbox_messages;
    create policy "Users can view own org outbox"
      on public.outbox_messages for select
      using (organization_id = public.auth_org_id());

    drop policy if exists "Users can insert to own org outbox" on public.outbox_messages;
    create policy "Users can insert to own org outbox"
      on public.outbox_messages for insert
      with check (organization_id = public.auth_org_id());

    drop policy if exists "Users can update own org outbox" on public.outbox_messages;
    create policy "Users can update own org outbox"
      on public.outbox_messages for update
      using (organization_id = public.auth_org_id());
  end if;
end;
$$;

create or replace function public.update_ai_agent_conversations_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_ai_agent_conversations_updated_at on public.ai_agent_conversations;
create trigger update_ai_agent_conversations_updated_at
  before update on public.ai_agent_conversations
  for each row execute function public.update_ai_agent_conversations_updated_at();

comment on column public.ai_agent_conversations.memory_summary is
  'Short operational memory used by Jhenny to avoid resending full chat history to the model.';
