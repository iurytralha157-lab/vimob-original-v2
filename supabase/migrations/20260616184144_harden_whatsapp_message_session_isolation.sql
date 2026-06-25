-- Harden WhatsApp isolation so app users can only read conversations/messages
-- that belong to WhatsApp sessions they own.

create or replace function public.whatsapp_message_conversation_session_matches(
  p_conversation_id uuid,
  p_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.whatsapp_conversations c
    where c.id = p_conversation_id
      and c.session_id = p_session_id
  );
$$;

create or replace function public.enforce_whatsapp_message_session_match()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_source public.whatsapp_conversations%rowtype;
  v_session public.whatsapp_sessions%rowtype;
  v_target_id uuid;
  v_remote_jid text;
  v_contact_phone text;
begin
  select *
  into v_source
  from public.whatsapp_conversations
  where id = new.conversation_id;

  if not found then
    raise exception 'WhatsApp conversation % was not found', new.conversation_id
      using errcode = '23503';
  end if;

  if new.session_id is null then
    new.session_id := v_source.session_id;
  end if;

  if new.session_id = v_source.session_id then
    return new;
  end if;

  select *
  into v_session
  from public.whatsapp_sessions
  where id = new.session_id;

  if not found then
    raise exception 'WhatsApp message session_id % was not found', new.session_id
      using errcode = '23503';
  end if;

  v_remote_jid := coalesce(nullif(new.remote_jid, ''), nullif(v_source.remote_jid, ''));
  v_contact_phone := coalesce(
    nullif(v_source.contact_phone, ''),
    case
      when v_remote_jid is not null and v_remote_jid not like '%@g.us'
        then regexp_replace(v_remote_jid, '\D', '', 'g')
      else null
    end
  );

  select c.id
  into v_target_id
  from public.whatsapp_conversations c
  where c.organization_id = v_session.organization_id
    and c.session_id = new.session_id
    and (
      (v_remote_jid is not null and c.remote_jid = v_remote_jid)
      or (
        v_contact_phone is not null
        and regexp_replace(coalesce(c.contact_phone, c.remote_jid, ''), '\D', '', 'g') = v_contact_phone
      )
    )
  order by (c.deleted_at is null) desc, c.last_message_at desc nulls last, c.created_at desc
  limit 1;

  if v_target_id is not null then
    update public.whatsapp_conversations c
    set deleted_at = null,
        updated_at = now(),
        lead_id = case when c.deleted_at is not null then null else c.lead_id end,
        remote_jid = coalesce(nullif(c.remote_jid, ''), v_remote_jid),
        contact_phone = coalesce(nullif(c.contact_phone, ''), v_contact_phone),
        contact_name = coalesce(nullif(c.contact_name, ''), nullif(v_source.contact_name, '')),
        contact_picture = coalesce(nullif(c.contact_picture, ''), nullif(v_source.contact_picture, ''))
    where c.id = v_target_id;
  else
    insert into public.whatsapp_conversations (
      session_id,
      organization_id,
      lead_id,
      remote_jid,
      contact_name,
      contact_phone,
      contact_picture,
      is_group,
      last_message,
      last_message_at,
      unread_count,
      created_at,
      updated_at
    ) values (
      new.session_id,
      v_session.organization_id,
      null,
      v_remote_jid,
      v_source.contact_name,
      v_contact_phone,
      v_source.contact_picture,
      coalesce(v_source.is_group, false),
      null,
      null,
      0,
      now(),
      now()
    )
    on conflict (session_id, remote_jid) do update
      set deleted_at = null,
          updated_at = now(),
          lead_id = case when public.whatsapp_conversations.deleted_at is not null then null else public.whatsapp_conversations.lead_id end,
          contact_phone = coalesce(nullif(public.whatsapp_conversations.contact_phone, ''), excluded.contact_phone),
          contact_name = coalesce(nullif(public.whatsapp_conversations.contact_name, ''), excluded.contact_name),
          contact_picture = coalesce(nullif(public.whatsapp_conversations.contact_picture, ''), excluded.contact_picture)
    returning id into v_target_id;
  end if;

  new.conversation_id := v_target_id;
  return new;
end;
$$;

drop trigger if exists trg_enforce_whatsapp_message_session_match on public.whatsapp_messages;
create trigger trg_enforce_whatsapp_message_session_match
  before insert or update of conversation_id, session_id on public.whatsapp_messages
  for each row
  execute function public.enforce_whatsapp_message_session_match();

create or replace function public.enforce_whatsapp_outbox_session_match()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_conversation public.whatsapp_conversations%rowtype;
begin
  if new.conversation_id is null then
    return new;
  end if;

  select *
  into v_conversation
  from public.whatsapp_conversations
  where id = new.conversation_id;

  if not found then
    raise exception 'WhatsApp conversation % was not found', new.conversation_id
      using errcode = '23503';
  end if;

  if new.session_id is null then
    new.session_id := v_conversation.session_id;
  end if;

  if new.organization_id is null then
    new.organization_id := v_conversation.organization_id;
  end if;

  if new.session_id is distinct from v_conversation.session_id then
    raise exception 'Outbox session % does not match conversation session %', new.session_id, v_conversation.session_id
      using errcode = '23514';
  end if;

  if new.organization_id is distinct from v_conversation.organization_id then
    raise exception 'Outbox organization % does not match conversation organization %', new.organization_id, v_conversation.organization_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_whatsapp_outbox_session_match on public.outbox_messages;
create trigger trg_enforce_whatsapp_outbox_session_match
  before insert or update of conversation_id, session_id, organization_id on public.outbox_messages
  for each row
  execute function public.enforce_whatsapp_outbox_session_match();

create or replace function public.vimob_can_access_whatsapp_session(
  p_session_id uuid,
  p_permission text default 'view'::text
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.whatsapp_sessions ws
    where ws.id = p_session_id
      and ws.owner_user_id = auth.uid()
  );
$$;

create or replace function public.can_access_whatsapp_session(
  p_session_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.whatsapp_sessions ws
    where ws.id = p_session_id
      and ws.owner_user_id = p_user_id
  );
$$;

create or replace function public.can_view_whatsapp_conversation(
  p_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.whatsapp_conversations c
    join public.whatsapp_sessions s on s.id = c.session_id
    where c.id = p_conversation_id
      and c.deleted_at is null
      and s.owner_user_id = auth.uid()
  );
$$;

with duplicate_map as (
  select
    m.id as old_message_id,
    existing.id as keep_message_id,
    target.id as target_conversation_id,
    s.id as target_session_id,
    s.organization_id as target_organization_id
  from public.whatsapp_messages m
  join public.whatsapp_conversations source on source.id = m.conversation_id
  join public.whatsapp_sessions s on s.id = m.session_id
  cross join lateral (
    select
      coalesce(nullif(m.remote_jid, ''), nullif(source.remote_jid, '')) as remote_jid,
      coalesce(
        nullif(source.contact_phone, ''),
        case
          when coalesce(nullif(m.remote_jid, ''), nullif(source.remote_jid, '')) is not null
            and coalesce(nullif(m.remote_jid, ''), nullif(source.remote_jid, '')) not like '%@g.us'
            then regexp_replace(coalesce(nullif(m.remote_jid, ''), nullif(source.remote_jid, '')), '\D', '', 'g')
          else null
        end
      ) as contact_phone
  ) keys
  join lateral (
    select c.id
    from public.whatsapp_conversations c
    where c.organization_id = s.organization_id
      and c.session_id = m.session_id
      and (
        (keys.remote_jid is not null and c.remote_jid = keys.remote_jid)
        or (
          keys.contact_phone is not null
          and regexp_replace(coalesce(c.contact_phone, c.remote_jid, ''), '\D', '', 'g') = keys.contact_phone
        )
      )
    order by (c.deleted_at is null) desc, c.last_message_at desc nulls last, c.created_at desc
    limit 1
  ) target on true
  join lateral (
    select wm.id
    from public.whatsapp_messages wm
    where wm.conversation_id = target.id
      and wm.message_id = m.message_id
      and wm.id <> m.id
    order by wm.sent_at desc nulls last, wm.id
    limit 1
  ) existing on true
  where m.session_id is not null
    and source.session_id is distinct from m.session_id
    and m.message_id is not null
), upd_attachments as (
  update public.lead_attachments la
  set message_id = dm.keep_message_id
  from duplicate_map dm
  where la.message_id = dm.old_message_id
  returning la.id
), upd_ai_outbox as (
  update public.ai_outbox_messages ao
  set sent_message_id = dm.keep_message_id
  from duplicate_map dm
  where ao.sent_message_id = dm.old_message_id
  returning ao.id
), upd_media_jobs as (
  update public.media_jobs mj
  set message_id = dm.keep_message_id,
      conversation_id = dm.target_conversation_id,
      session_id = dm.target_session_id,
      organization_id = dm.target_organization_id,
      updated_at = now()
  from duplicate_map dm
  where mj.message_id = dm.old_message_id
  returning mj.id
)
delete from public.whatsapp_messages wm
using duplicate_map dm
where wm.id = dm.old_message_id;

update public.whatsapp_messages m
set conversation_id = m.conversation_id
from public.whatsapp_conversations c
where c.id = m.conversation_id
  and m.session_id is not null
  and c.session_id is distinct from m.session_id;

revoke all on public.whatsapp_sessions from anon;
revoke all on public.whatsapp_session_access from anon;
revoke all on public.whatsapp_conversations from anon;
revoke all on public.whatsapp_messages from anon;
revoke all on public.whatsapp_groups from anon;
revoke all on public.whatsapp_chat_labels from anon;
revoke all on public.media_jobs from anon;
revoke all on public.outbox_messages from anon;
revoke all on public.chatbot_conversation_state from anon;
revoke all on public.chatbot_inbound_messages from anon;

revoke all on public.whatsapp_session_access from authenticated;
revoke all on public.media_jobs from authenticated;
revoke all on public.outbox_messages from authenticated;
revoke all on public.chatbot_conversation_state from authenticated;
revoke all on public.chatbot_inbound_messages from authenticated;

grant select, insert, update, delete on public.whatsapp_sessions to authenticated;
grant select, insert, update, delete on public.whatsapp_conversations to authenticated;
grant select, insert, update on public.whatsapp_messages to authenticated;
grant select, insert, update, delete on public.whatsapp_groups to authenticated;
grant select, insert, update, delete on public.whatsapp_chat_labels to authenticated;

grant all on public.whatsapp_sessions to service_role;
grant all on public.whatsapp_session_access to service_role;
grant all on public.whatsapp_conversations to service_role;
grant all on public.whatsapp_messages to service_role;
grant all on public.whatsapp_groups to service_role;
grant all on public.whatsapp_chat_labels to service_role;
grant all on public.media_jobs to service_role;
grant all on public.outbox_messages to service_role;
grant all on public.chatbot_conversation_state to service_role;
grant all on public.chatbot_inbound_messages to service_role;

alter table public.whatsapp_sessions enable row level security;
alter table public.whatsapp_session_access enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_groups enable row level security;
alter table public.whatsapp_chat_labels enable row level security;
alter table public.media_jobs enable row level security;
alter table public.outbox_messages enable row level security;
alter table public.chatbot_conversation_state enable row level security;
alter table public.chatbot_inbound_messages enable row level security;

drop policy if exists "Service role can manage all media_jobs" on public.media_jobs;
drop policy if exists whatsapp_session_access_super_admin_only on public.whatsapp_session_access;

drop policy if exists whatsapp_sessions_select_accessible on public.whatsapp_sessions;
drop policy if exists whatsapp_sessions_insert_own on public.whatsapp_sessions;
drop policy if exists whatsapp_sessions_update_own on public.whatsapp_sessions;
drop policy if exists whatsapp_sessions_delete_own on public.whatsapp_sessions;
drop policy if exists whatsapp_sessions_select_owner_only on public.whatsapp_sessions;
drop policy if exists whatsapp_sessions_insert_owner_only on public.whatsapp_sessions;
drop policy if exists whatsapp_sessions_update_owner_only on public.whatsapp_sessions;
drop policy if exists whatsapp_sessions_delete_owner_only on public.whatsapp_sessions;

create policy whatsapp_sessions_select_owner_only on public.whatsapp_sessions
  for select to authenticated
  using (owner_user_id = auth.uid());

create policy whatsapp_sessions_insert_owner_only on public.whatsapp_sessions
  for insert to authenticated
  with check (owner_user_id = auth.uid() and organization_id = public.get_user_organization_id());

create policy whatsapp_sessions_update_owner_only on public.whatsapp_sessions
  for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid() and organization_id = public.get_user_organization_id());

create policy whatsapp_sessions_delete_owner_only on public.whatsapp_sessions
  for delete to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists whatsapp_conversations_select_owner_only on public.whatsapp_conversations;
drop policy if exists whatsapp_conversations_insert_owner_only on public.whatsapp_conversations;
drop policy if exists whatsapp_conversations_update_owner_only on public.whatsapp_conversations;
drop policy if exists whatsapp_conversations_delete_owner_only on public.whatsapp_conversations;
drop policy if exists whatsapp_conversations_select_lead_access on public.whatsapp_conversations;
drop policy if exists whatsapp_conversations_select_session_access on public.whatsapp_conversations;
drop policy if exists whatsapp_conversations_insert_authenticated on public.whatsapp_conversations;
drop policy if exists whatsapp_conversations_update_authenticated on public.whatsapp_conversations;

create policy whatsapp_conversations_select_owner_only on public.whatsapp_conversations
  for select to authenticated
  using (public.can_view_whatsapp_conversation(id));

create policy whatsapp_conversations_insert_owner_only on public.whatsapp_conversations
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.whatsapp_sessions s
      where s.id = whatsapp_conversations.session_id
        and s.organization_id = whatsapp_conversations.organization_id
        and s.owner_user_id = auth.uid()
    )
  );

create policy whatsapp_conversations_update_owner_only on public.whatsapp_conversations
  for update to authenticated
  using (public.can_view_whatsapp_conversation(id))
  with check (
    exists (
      select 1
      from public.whatsapp_sessions s
      where s.id = whatsapp_conversations.session_id
        and s.organization_id = whatsapp_conversations.organization_id
        and s.owner_user_id = auth.uid()
    )
  );

create policy whatsapp_conversations_delete_owner_only on public.whatsapp_conversations
  for delete to authenticated
  using (public.can_view_whatsapp_conversation(id));

drop policy if exists whatsapp_messages_select_owner_only on public.whatsapp_messages;
drop policy if exists whatsapp_messages_insert_owner_only on public.whatsapp_messages;
drop policy if exists whatsapp_messages_update_owner_only on public.whatsapp_messages;
drop policy if exists whatsapp_messages_super_admin_all on public.whatsapp_messages;
drop policy if exists messages_select_lead_access on public.whatsapp_messages;
drop policy if exists whatsapp_messages_select_lead_access on public.whatsapp_messages;
drop policy if exists whatsapp_messages_select_session_access on public.whatsapp_messages;
drop policy if exists whatsapp_messages_insert_authenticated on public.whatsapp_messages;
drop policy if exists whatsapp_messages_update_authenticated on public.whatsapp_messages;

create policy whatsapp_messages_select_owner_only on public.whatsapp_messages
  for select to authenticated
  using (
    public.whatsapp_message_conversation_session_matches(conversation_id, session_id)
    and public.can_view_whatsapp_conversation(conversation_id)
  );

create policy whatsapp_messages_insert_owner_only on public.whatsapp_messages
  for insert to authenticated
  with check (
    public.whatsapp_message_conversation_session_matches(conversation_id, session_id)
    and public.can_view_whatsapp_conversation(conversation_id)
  );

create policy whatsapp_messages_update_owner_only on public.whatsapp_messages
  for update to authenticated
  using (
    public.whatsapp_message_conversation_session_matches(conversation_id, session_id)
    and public.can_view_whatsapp_conversation(conversation_id)
  )
  with check (
    public.whatsapp_message_conversation_session_matches(conversation_id, session_id)
    and public.can_view_whatsapp_conversation(conversation_id)
  );

drop policy if exists whatsapp_groups_owner_select on public.whatsapp_groups;
drop policy if exists whatsapp_groups_owner_manage on public.whatsapp_groups;
drop policy if exists whatsapp_groups_select_accessible on public.whatsapp_groups;
drop policy if exists whatsapp_groups_manage_accessible on public.whatsapp_groups;

create policy whatsapp_groups_owner_manage on public.whatsapp_groups
  for all to authenticated
  using (public.vimob_can_access_whatsapp_session(session_id, 'view'))
  with check (public.vimob_can_access_whatsapp_session(session_id, 'view'));

drop policy if exists whatsapp_chat_labels_owner_select on public.whatsapp_chat_labels;
drop policy if exists whatsapp_chat_labels_owner_manage on public.whatsapp_chat_labels;
drop policy if exists whatsapp_chat_labels_select_accessible on public.whatsapp_chat_labels;
drop policy if exists whatsapp_chat_labels_manage_accessible on public.whatsapp_chat_labels;

create policy whatsapp_chat_labels_owner_manage on public.whatsapp_chat_labels
  for all to authenticated
  using (public.can_view_whatsapp_conversation(conversation_id))
  with check (public.can_view_whatsapp_conversation(conversation_id));
