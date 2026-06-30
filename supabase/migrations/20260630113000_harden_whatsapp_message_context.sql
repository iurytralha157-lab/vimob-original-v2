-- Ensure every WhatsApp message inherits its organization/session context from
-- the conversation before NOT NULL constraints and RLS checks are evaluated.
create or replace function public.set_whatsapp_message_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_org_id uuid;
  conversation_lead_id uuid;
  conversation_session_id uuid;
  conversation_remote_jid text;
  session_org_id uuid;
begin
  if new.conversation_id is not null then
    select
      wc.organization_id,
      wc.lead_id,
      wc.session_id,
      wc.remote_jid
    into
      conversation_org_id,
      conversation_lead_id,
      conversation_session_id,
      conversation_remote_jid
    from public.whatsapp_conversations wc
    where wc.id = new.conversation_id;

    if conversation_org_id is null then
      raise exception 'whatsapp_messages.conversation_id_not_found';
    end if;

    new.organization_id := conversation_org_id;
    new.session_id := coalesce(conversation_session_id, new.session_id);

    if new.lead_id is null then
      new.lead_id := conversation_lead_id;
    end if;

    if new.remote_jid is null then
      new.remote_jid := conversation_remote_jid;
    end if;
  elsif new.organization_id is null and new.session_id is not null then
    select ws.organization_id
    into session_org_id
    from public.whatsapp_sessions ws
    where ws.id = new.session_id;

    new.organization_id := session_org_id;
  end if;

  if new.organization_id is null then
    raise exception 'whatsapp_messages.organization_id_required';
  end if;

  return new;
end;
$$;

drop trigger if exists set_whatsapp_message_context_before_write on public.whatsapp_messages;

create trigger set_whatsapp_message_context_before_write
before insert or update of conversation_id, session_id, organization_id, lead_id, remote_jid
on public.whatsapp_messages
for each row
execute function public.set_whatsapp_message_context();

update public.whatsapp_messages wm
set
  organization_id = wc.organization_id,
  lead_id = coalesce(wm.lead_id, wc.lead_id),
  remote_jid = coalesce(wm.remote_jid, wc.remote_jid)
from public.whatsapp_conversations wc
where wm.conversation_id = wc.id
  and (
    wm.organization_id is distinct from wc.organization_id
    or (wm.lead_id is null and wc.lead_id is not null)
    or (wm.remote_jid is null and wc.remote_jid is not null)
  );

comment on function public.set_whatsapp_message_context()
is 'Fills whatsapp_messages organization/session/lead context from the conversation before writes.';
