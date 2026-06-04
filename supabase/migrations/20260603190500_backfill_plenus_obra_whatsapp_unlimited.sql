-- Backfill organization registered as PLENUS OBRA (singular) with unlimited WhatsApp sessions.
update public.organizations
set max_whatsapp_sessions_override = 0
where lower(name) like '%plenos obra%'
   or lower(name) like '%plenus obra%';
