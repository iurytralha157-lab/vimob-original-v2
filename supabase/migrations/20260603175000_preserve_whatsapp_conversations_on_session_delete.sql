-- Preserve WhatsApp conversations when a WhatsApp session/request is removed.
-- Messages already preserve their session history with SET NULL; conversations must do the same.

alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_session_id_fkey;

alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_session_id_fkey
  foreign key (session_id)
  references public.whatsapp_sessions(id)
  on delete set null;
