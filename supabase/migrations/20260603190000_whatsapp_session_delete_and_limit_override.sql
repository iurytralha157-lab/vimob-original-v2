-- Allow deleting a WhatsApp session without deleting or blocking its history.
-- Existing FK rules use ON DELETE SET NULL, so the columns must be nullable.
alter table public.whatsapp_messages
  alter column session_id drop not null;

alter table public.whatsapp_conversations
  alter column session_id drop not null;

-- Organization-level override for WhatsApp connection limits.
-- NULL follows the subscription plan, 0 means unlimited, positive values override the plan limit.
alter table public.organizations
  add column if not exists max_whatsapp_sessions_override integer;

comment on column public.organizations.max_whatsapp_sessions_override is
  'WhatsApp session limit override. NULL follows plan, 0 means unlimited, positive values override plan limit.';

update public.organizations
set max_whatsapp_sessions_override = 0
where lower(name) like '%plenos obras%'
   or lower(name) like '%plenos obra%'
   or lower(name) like '%plenus obras%'
   or lower(name) like '%plenus obra%'
   or lower(name) like '%plenos imobiliaria%'
   or lower(name) like '%plenos imobiliária%'
   or lower(name) like '%plenus imobiliaria%'
   or lower(name) like '%plenus imobiliária%'
   or lower(name) like '%nexo%'
   or lower(name) like '%nexos%';
