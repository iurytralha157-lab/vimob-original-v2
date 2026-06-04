create table if not exists public.password_change_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  changed_at timestamptz not null default now(),
  source text not null check (source in ('settings', 'recovery')),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_password_change_events_user_changed_at
on public.password_change_events(user_id, changed_at desc);

create table if not exists public.password_change_lockouts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  locked_until timestamptz,
  lock_level integer not null default 0,
  last_lock_reason text,
  updated_at timestamptz not null default now()
);

alter table public.password_change_events enable row level security;
alter table public.password_change_lockouts enable row level security;

grant select on public.password_change_events to authenticated;
grant select on public.password_change_lockouts to authenticated;

drop policy if exists "Users can read own password change events" on public.password_change_events;
create policy "Users can read own password change events"
on public.password_change_events
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read own password change lockout" on public.password_change_lockouts;
create policy "Users can read own password change lockout"
on public.password_change_lockouts
for select
to authenticated
using (auth.uid() = user_id);
