alter table public.schedule_events
add column if not exists visibility text not null default 'default'
check (visibility in ('default', 'public', 'private'));

update public.schedule_events
set visibility = 'default'
where visibility is null;

comment on column public.schedule_events.visibility is
'Controls agenda event visibility: default shows details to organization members, public shows only availability to non-owners, private only appears to the owner.';
