-- Religa conversas diretas de WhatsApp que ficaram sem lead_id, usando telefone
-- normalizado dentro da mesma organizacao. Nao apaga mensagens e nao altera midias.
with candidates as (
  select
    c.id as conversation_id,
    (
      select l.id
      from public.leads l
      where l.organization_id = c.organization_id
        and length(regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g')) >= 8
        and right(regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g'), 8) =
            right(regexp_replace(coalesce(c.contact_phone, c.remote_jid, ''), '[^0-9]', '', 'g'), 8)
      order by l.updated_at desc nulls last, l.created_at desc
      limit 1
    ) as lead_id
  from public.whatsapp_conversations c
  where c.lead_id is null
    and coalesce(c.is_group, false) = false
    and length(regexp_replace(coalesce(c.contact_phone, c.remote_jid, ''), '[^0-9]', '', 'g')) >= 8
)
update public.whatsapp_conversations c
set
  lead_id = candidates.lead_id,
  updated_at = now()
from candidates
where c.id = candidates.conversation_id
  and candidates.lead_id is not null;
