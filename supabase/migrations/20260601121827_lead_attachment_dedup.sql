delete from public.lead_attachments la
using public.lead_attachments duplicate
where la.lead_id = duplicate.lead_id
  and la.message_id = duplicate.message_id
  and la.message_id is not null
  and la.created_at > duplicate.created_at;

create unique index if not exists idx_lead_attachments_unique_message
  on public.lead_attachments (lead_id, message_id)
  where message_id is not null;
