alter table public.schedule_events
add column if not exists recurrence_parent_id uuid references public.schedule_events(id) on delete set null,
add column if not exists recurrence_rule text check (recurrence_rule in ('weekly', 'monthly', 'yearly')),
add column if not exists recurrence_until timestamptz,
add column if not exists recurrence_count integer;

create index if not exists idx_schedule_events_recurrence_parent
on public.schedule_events(recurrence_parent_id);

comment on column public.schedule_events.recurrence_parent_id is 'Links generated occurrences to the first event in a recurring series.';
comment on column public.schedule_events.recurrence_rule is 'Recurrence frequency for a schedule event series.';
comment on column public.schedule_events.recurrence_until is 'Optional end date for recurrence generation.';
comment on column public.schedule_events.recurrence_count is 'Requested number of occurrences generated for the series.';
