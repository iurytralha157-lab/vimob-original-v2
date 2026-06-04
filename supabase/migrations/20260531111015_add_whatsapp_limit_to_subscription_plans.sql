alter table public.admin_subscription_plans
  add column if not exists max_whatsapp_sessions integer default 1;

update public.admin_subscription_plans
set max_whatsapp_sessions = case
  when lower(name) like '%enterprise%' then 10
  when lower(name) like '%profissional%' then 5
  when lower(name) like '%básico%' or lower(name) like '%basico%' then 2
  when lower(name) like '%trial%' then 1
  else coalesce(max_whatsapp_sessions, 2)
end
where max_whatsapp_sessions is null or max_whatsapp_sessions = 1;
