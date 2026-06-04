-- Preserve WhatsApp message history when a WhatsApp session/request is removed.
-- The session link can be cleared, but lead conversations and messages must remain auditable.

alter table public.whatsapp_messages
  drop constraint if exists whatsapp_messages_session_id_fkey;

alter table public.whatsapp_messages
  add constraint whatsapp_messages_session_id_fkey
  foreign key (session_id)
  references public.whatsapp_sessions(id)
  on delete set null;
