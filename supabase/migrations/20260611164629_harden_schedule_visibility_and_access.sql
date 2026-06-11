-- Harden agenda visibility and write access.
-- Direct table reads only expose full event rows when the user is allowed to see details.
-- The RPC below preserves the UX for public "busy" slots by returning masked rows.

alter table public.schedule_events
  add column if not exists visibility text not null default 'default'
  check (visibility in ('default', 'public', 'private'));

create index if not exists idx_schedule_events_org_start_time
  on public.schedule_events (organization_id, start_time);

create index if not exists idx_schedule_events_visibility
  on public.schedule_events (organization_id, visibility);

create table if not exists public.schedule_event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.schedule_events(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.schedule_event_comments enable row level security;

create index if not exists idx_schedule_comments_event_id
  on public.schedule_event_comments(event_id);

create index if not exists idx_schedule_comments_org_id
  on public.schedule_event_comments(organization_id);

create table if not exists public.schedule_event_assignees (
  event_id uuid not null references public.schedule_events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.schedule_event_assignees enable row level security;

create index if not exists idx_schedule_assignees_event
  on public.schedule_event_assignees(event_id);

create index if not exists idx_schedule_assignees_user
  on public.schedule_event_assignees(user_id);

insert into public.schedule_event_assignees (event_id, user_id, organization_id)
select id, user_id, organization_id
from public.schedule_events
where user_id is not null
on conflict do nothing;

create or replace function public.is_schedule_event_assignee(
  p_event_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.schedule_event_assignees sea
    where sea.event_id = p_event_id
      and sea.user_id = p_user_id
  );
$$;

create or replace function public.can_access_schedule_event(
  p_event_id uuid,
  p_require_full_details boolean default true
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with ctx as (
    select
      auth.uid() as user_id,
      public.get_user_organization_id() as organization_id,
      public.is_admin() as is_admin,
      public.is_super_admin() as is_super_admin
  )
  select exists (
    select 1
    from public.schedule_events e
    cross join ctx
    where e.id = p_event_id
      and ctx.user_id is not null
      and (
        ctx.is_super_admin
        or (
          e.organization_id = ctx.organization_id
          and (
            case
              when p_require_full_details then
                coalesce(e.visibility, 'default') = 'default'
                or e.user_id = ctx.user_id
                or ctx.is_admin
                or public.is_schedule_event_assignee(e.id, ctx.user_id)
              else
                coalesce(e.visibility, 'default') in ('default', 'public')
                or e.user_id = ctx.user_id
                or ctx.is_admin
                or public.is_schedule_event_assignee(e.id, ctx.user_id)
            end
          )
        )
      )
  );
$$;

revoke all on function public.is_schedule_event_assignee(uuid, uuid) from public;
grant execute on function public.is_schedule_event_assignee(uuid, uuid) to authenticated;

revoke all on function public.can_access_schedule_event(uuid, boolean) from public;
grant execute on function public.can_access_schedule_event(uuid, boolean) to authenticated;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'schedule_events'
  loop
    execute format('drop policy if exists %I on public.schedule_events', policy_record.policyname);
  end loop;
end $$;

drop policy if exists "Hierarchical schedule event access" on public.schedule_events;
drop policy if exists "Users can create schedule events" on public.schedule_events;
drop policy if exists "Users can update own schedule events" on public.schedule_events;
drop policy if exists "Users can delete own schedule events" on public.schedule_events;
drop policy if exists "Org members can view schedule events" on public.schedule_events;
drop policy if exists "Users can insert own events" on public.schedule_events;
drop policy if exists "Users can update own events" on public.schedule_events;
drop policy if exists "Users can delete own events" on public.schedule_events;
drop policy if exists "Org members can insert schedule events" on public.schedule_events;
drop policy if exists "Org members can update schedule events" on public.schedule_events;
drop policy if exists "Org members can delete schedule events" on public.schedule_events;
drop policy if exists "Users can view their organization events" on public.schedule_events;
drop policy if exists "Users can create schedule events" on public.schedule_events;
drop policy if exists "Users can update their organization events" on public.schedule_events;
drop policy if exists "Users can delete their organization events" on public.schedule_events;
drop policy if exists "Admins can insert events for others" on public.schedule_events;
drop policy if exists "Schedule events full detail access" on public.schedule_events;
drop policy if exists "Schedule events scoped insert" on public.schedule_events;
drop policy if exists "Schedule events scoped update" on public.schedule_events;
drop policy if exists "Schedule events scoped delete" on public.schedule_events;

create policy "Schedule events full detail access"
on public.schedule_events
for select
to authenticated
using (
  public.is_super_admin()
  or (
    organization_id = public.get_user_organization_id()
    and (
      coalesce(visibility, 'default') = 'default'
      or user_id = auth.uid()
      or public.is_admin()
      or public.is_schedule_event_assignee(id, auth.uid())
    )
  )
);

create policy "Schedule events scoped insert"
on public.schedule_events
for insert
to authenticated
with check (
  organization_id = public.get_user_organization_id()
  and exists (
    select 1
    from public.users u
    where u.id = schedule_events.user_id
      and u.organization_id = public.get_user_organization_id()
  )
);

create policy "Schedule events scoped update"
on public.schedule_events
for update
to authenticated
using (
  public.is_super_admin()
  or (
    organization_id = public.get_user_organization_id()
    and (
      user_id = auth.uid()
      or public.is_admin()
      or public.is_schedule_event_assignee(id, auth.uid())
    )
  )
)
with check (
  organization_id = public.get_user_organization_id()
  and exists (
    select 1
    from public.users u
    where u.id = schedule_events.user_id
      and u.organization_id = public.get_user_organization_id()
  )
);

create policy "Schedule events scoped delete"
on public.schedule_events
for delete
to authenticated
using (
  public.is_super_admin()
  or (
    organization_id = public.get_user_organization_id()
    and (
      user_id = auth.uid()
      or public.is_admin()
    )
  )
);

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'schedule_event_comments'
  loop
    execute format('drop policy if exists %I on public.schedule_event_comments', policy_record.policyname);
  end loop;
end $$;

drop policy if exists "Membros podem ver comentários de seus eventos" on public.schedule_event_comments;
drop policy if exists "Usuários podem comentar em eventos da sua organização" on public.schedule_event_comments;
drop policy if exists "view_schedule_comments_org" on public.schedule_event_comments;
drop policy if exists "insert_schedule_comments_org" on public.schedule_event_comments;
drop policy if exists "delete_own_schedule_comments" on public.schedule_event_comments;
drop policy if exists "Schedule comments full detail access" on public.schedule_event_comments;
drop policy if exists "Schedule comments scoped insert" on public.schedule_event_comments;
drop policy if exists "Schedule comments own delete" on public.schedule_event_comments;

create policy "Schedule comments full detail access"
on public.schedule_event_comments
for select
to authenticated
using (
  organization_id = public.get_user_organization_id()
  and public.can_access_schedule_event(event_id, true)
);

create policy "Schedule comments scoped insert"
on public.schedule_event_comments
for insert
to authenticated
with check (
  user_id = auth.uid()
  and organization_id = public.get_user_organization_id()
  and public.can_access_schedule_event(event_id, true)
);

create policy "Schedule comments own delete"
on public.schedule_event_comments
for delete
to authenticated
using (
  public.is_super_admin()
  or (
    organization_id = public.get_user_organization_id()
    and (
      user_id = auth.uid()
      or public.is_admin()
    )
  )
);

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'schedule_event_assignees'
  loop
    execute format('drop policy if exists %I on public.schedule_event_assignees', policy_record.policyname);
  end loop;
end $$;

drop policy if exists "view_schedule_assignees_org" on public.schedule_event_assignees;
drop policy if exists "manage_schedule_assignees_org" on public.schedule_event_assignees;
drop policy if exists "Schedule assignees full detail access" on public.schedule_event_assignees;
drop policy if exists "Schedule assignees scoped insert" on public.schedule_event_assignees;
drop policy if exists "Schedule assignees scoped delete" on public.schedule_event_assignees;

create policy "Schedule assignees full detail access"
on public.schedule_event_assignees
for select
to authenticated
using (
  organization_id = public.get_user_organization_id()
  and public.can_access_schedule_event(event_id, true)
);

create policy "Schedule assignees scoped insert"
on public.schedule_event_assignees
for insert
to authenticated
with check (
  organization_id = public.get_user_organization_id()
  and exists (
    select 1
    from public.users u
    where u.id = schedule_event_assignees.user_id
      and u.organization_id = public.get_user_organization_id()
  )
  and exists (
    select 1
    from public.schedule_events e
    where e.id = schedule_event_assignees.event_id
      and e.organization_id = public.get_user_organization_id()
      and (
        e.user_id = auth.uid()
        or public.is_admin()
        or public.is_super_admin()
      )
  )
);

create policy "Schedule assignees scoped delete"
on public.schedule_event_assignees
for delete
to authenticated
using (
  organization_id = public.get_user_organization_id()
  and exists (
    select 1
    from public.schedule_events e
    where e.id = schedule_event_assignees.event_id
      and (
        e.user_id = auth.uid()
        or public.is_admin()
        or public.is_super_admin()
      )
  )
);

create or replace function public.get_schedule_events_secure(
  p_user_id uuid default null,
  p_lead_id uuid default null,
  p_start_time timestamptz default null,
  p_end_time timestamptz default null
)
returns table (
  id uuid,
  organization_id uuid,
  user_id uuid,
  lead_id uuid,
  property_id uuid,
  title text,
  description text,
  event_type text,
  start_time timestamptz,
  end_time timestamptz,
  is_all_day boolean,
  location text,
  status text,
  visibility text,
  reminder_minutes integer,
  recurrence_parent_id uuid,
  recurrence_rule text,
  recurrence_until timestamptz,
  recurrence_count integer,
  google_event_id text,
  completed_by uuid,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  user_name text,
  user_avatar_url text,
  lead_name text,
  lead_phone text,
  property_title text,
  property_code text,
  completed_by_user_name text,
  assignee_user_ids uuid[],
  is_masked boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with ctx as (
    select
      auth.uid() as current_user_id,
      public.get_user_organization_id() as current_organization_id,
      public.is_admin() as is_admin,
      public.is_super_admin() as is_super_admin
  ),
  enriched as (
    select
      e.*,
      coalesce(assignees.assignee_ids, array[]::uuid[]) as assignee_ids,
      (
        e.user_id = (select current_user_id from ctx)
        or (select is_admin from ctx)
        or (select is_super_admin from ctx)
        or coalesce(assignees.is_current_user_assignee, false)
      ) as has_full_access
    from public.schedule_events e
    left join lateral (
      select
        array_agg(sea.user_id) filter (where sea.user_id is not null) as assignee_ids,
        bool_or(sea.user_id = (select current_user_id from ctx)) as is_current_user_assignee
      from public.schedule_event_assignees sea
      where sea.event_id = e.id
    ) assignees on true
    where
      ((select is_super_admin from ctx) or e.organization_id = (select current_organization_id from ctx))
      and (p_start_time is null or e.start_time >= p_start_time)
      and (p_end_time is null or e.start_time <= p_end_time)
      and (p_user_id is null or e.user_id = p_user_id or exists (
        select 1
        from public.schedule_event_assignees sea_filter
        where sea_filter.event_id = e.id
          and sea_filter.user_id = p_user_id
      ))
  ),
  scoped as (
    select
      enriched.*,
      (coalesce(enriched.visibility, 'default') = 'public' and not enriched.has_full_access) as masked
    from enriched
    where
      coalesce(enriched.visibility, 'default') in ('default', 'public')
      or enriched.has_full_access
  )
  select
    s.id,
    s.organization_id,
    s.user_id,
    case when s.masked then null::uuid else s.lead_id end,
    case when s.masked then null::uuid else s.property_id end,
    case when s.masked then 'Horario ocupado'::text else s.title end,
    case when s.masked then 'Informacao privada'::text else s.description end,
    case when s.masked then 'task'::text else s.event_type end,
    s.start_time,
    s.end_time,
    s.is_all_day,
    case when s.masked then null::text else s.location end,
    s.status,
    s.visibility,
    case when s.masked then null::integer else s.reminder_minutes end,
    case when s.masked then null::uuid else s.recurrence_parent_id end,
    case when s.masked then null::text else s.recurrence_rule end,
    case when s.masked then null::timestamptz else s.recurrence_until end,
    case when s.masked then null::integer else s.recurrence_count end,
    case when s.masked then null::text else s.google_event_id end,
    case when s.masked then null::uuid else s.completed_by end,
    case when s.masked then null::timestamptz else s.completed_at end,
    s.created_at,
    s.updated_at,
    u.name,
    u.avatar_url,
    case when s.masked then null::text else l.name end,
    case when s.masked then null::text else l.phone end,
    case when s.masked then null::text else p.title end,
    case when s.masked then null::text else p.code end,
    case when s.masked then null::text else completed_user.name end,
    case when s.masked then array[]::uuid[] else s.assignee_ids end,
    s.masked
  from scoped s
  left join public.users u on u.id = s.user_id
  left join public.leads l on l.id = s.lead_id
  left join public.properties p on p.id = s.property_id
  left join public.users completed_user on completed_user.id = s.completed_by
  where p_lead_id is null or (not s.masked and s.lead_id = p_lead_id)
  order by s.start_time asc;
$$;

revoke all on function public.get_schedule_events_secure(uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_schedule_events_secure(uuid, uuid, timestamptz, timestamptz) to authenticated;
