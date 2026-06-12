-- Harden Arena Imobiliaria RLS without changing current scoring rules.
--
-- Scope:
-- 1. Prevent regular users from self-approving manual gamification entries.
-- 2. Ensure prospecting reports can only be inserted for the authenticated
--    user's own organization and with non-negative counters.
-- 3. Ensure gamification participants has the expected RLS/constraints.

-- ---------------------------------------------------------------------------
-- Manual entries: users can create pending requests; admins approve/reject.
-- ---------------------------------------------------------------------------

alter table if exists public.gamification_manual_entries enable row level security;

grant select, insert, update, delete on public.gamification_manual_entries to authenticated;

drop policy if exists "Users can manage own manual gamification entries"
  on public.gamification_manual_entries;
drop policy if exists "Admins can manage org manual gamification entries"
  on public.gamification_manual_entries;
drop policy if exists "Users can view own manual gamification entries"
  on public.gamification_manual_entries;
drop policy if exists "Users can create own pending manual gamification entries"
  on public.gamification_manual_entries;
drop policy if exists "Admins can view org manual gamification entries"
  on public.gamification_manual_entries;
drop policy if exists "Admins can update org manual gamification entries"
  on public.gamification_manual_entries;
drop policy if exists "Admins can delete org manual gamification entries"
  on public.gamification_manual_entries;

create policy "Users can view own manual gamification entries"
on public.gamification_manual_entries
for select
using (
  user_id = auth.uid()
  or public.is_super_admin()
  or (
    organization_id = public.get_user_organization_id()
    and public.is_admin()
  )
);

create policy "Users can create own pending manual gamification entries"
on public.gamification_manual_entries
for insert
with check (
  user_id = auth.uid()
  and organization_id = public.get_user_organization_id()
  and status = 'pending'
  and approved_by is null
  and approved_at is null
);

create policy "Admins can update org manual gamification entries"
on public.gamification_manual_entries
for update
using (
  public.is_super_admin()
  or (
    organization_id = public.get_user_organization_id()
    and public.is_admin()
  )
)
with check (
  public.is_super_admin()
  or (
    organization_id = public.get_user_organization_id()
    and public.is_admin()
  )
);

create policy "Admins can delete org manual gamification entries"
on public.gamification_manual_entries
for delete
using (
  public.is_super_admin()
  or (
    organization_id = public.get_user_organization_id()
    and public.is_admin()
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'gamification_manual_entries_quantity_positive'
      and conrelid = 'public.gamification_manual_entries'::regclass
  ) then
    alter table public.gamification_manual_entries
      add constraint gamification_manual_entries_quantity_positive
      check (quantity > 0) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'gamification_manual_entries_status_valid'
      and conrelid = 'public.gamification_manual_entries'::regclass
  ) then
    alter table public.gamification_manual_entries
      add constraint gamification_manual_entries_status_valid
      check (status in ('pending', 'approved', 'rejected')) not valid;
  end if;
end $$;

create index if not exists idx_gamification_manual_entries_org_status
  on public.gamification_manual_entries (organization_id, status, created_at);

-- ---------------------------------------------------------------------------
-- Prospecting reports: keep direct scoring, but lock inserts to own org.
-- ---------------------------------------------------------------------------

alter table if exists public.prospecting_reports enable row level security;

grant select, insert, update, delete on public.prospecting_reports to authenticated;

drop policy if exists "Users can manage their own reports"
  on public.prospecting_reports;
drop policy if exists "Users can view reports from their organization"
  on public.prospecting_reports;
drop policy if exists "Users can view own and org prospecting reports"
  on public.prospecting_reports;
drop policy if exists "Users can create own prospecting reports"
  on public.prospecting_reports;
drop policy if exists "Admins can manage org prospecting reports"
  on public.prospecting_reports;
drop policy if exists "Admins can delete org prospecting reports"
  on public.prospecting_reports;

create policy "Users can view own and org prospecting reports"
on public.prospecting_reports
for select
using (
  public.is_super_admin()
  or organization_id = public.get_user_organization_id()
);

create policy "Users can create own prospecting reports"
on public.prospecting_reports
for insert
with check (
  user_id = auth.uid()
  and organization_id = public.get_user_organization_id()
);

create policy "Admins can manage org prospecting reports"
on public.prospecting_reports
for update
using (
  public.is_super_admin()
  or (
    organization_id = public.get_user_organization_id()
    and public.is_admin()
  )
)
with check (
  public.is_super_admin()
  or (
    organization_id = public.get_user_organization_id()
    and public.is_admin()
  )
);

create policy "Admins can delete org prospecting reports"
on public.prospecting_reports
for delete
using (
  public.is_super_admin()
  or (
    organization_id = public.get_user_organization_id()
    and public.is_admin()
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'prospecting_reports_non_negative_counts'
      and conrelid = 'public.prospecting_reports'::regclass
  ) then
    alter table public.prospecting_reports
      add constraint prospecting_reports_non_negative_counts
      check (
        coalesce(calls, 0) >= 0
        and coalesce(messages, 0) >= 0
        and coalesce(contacts, 0) >= 0
        and coalesce(visits, 0) >= 0
        and coalesce(scheduled_visits, 0) >= 0
        and coalesce(confirmed_visits, 0) >= 0
        and coalesce(meetings, 0) >= 0
        and coalesce(proposals_sent, 0) >= 0
        and coalesce(property_capturing, 0) >= 0
      ) not valid;
  end if;
end $$;

create index if not exists idx_prospecting_reports_org_user_created
  on public.prospecting_reports (organization_id, user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Participants: make the repo safe even if this table was created manually.
-- ---------------------------------------------------------------------------

create table if not exists public.gamification_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  participates boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.gamification_participants enable row level security;

grant select, insert, update, delete on public.gamification_participants to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'gamification_participants_org_user_key'
  ) then
    if not exists (
      select 1
      from public.gamification_participants
      group by organization_id, user_id
      having count(*) > 1
    ) then
      create unique index gamification_participants_org_user_key
        on public.gamification_participants (organization_id, user_id);
    else
      raise notice 'Skipped unique index gamification_participants_org_user_key because duplicate rows exist.';
    end if;
  end if;
end $$;

create index if not exists idx_gamification_participants_org_participates
  on public.gamification_participants (organization_id, participates);

drop policy if exists "Users can view gamification participants in org"
  on public.gamification_participants;
drop policy if exists "Admins can manage gamification participants in org"
  on public.gamification_participants;

create policy "Users can view gamification participants in org"
on public.gamification_participants
for select
using (
  public.is_super_admin()
  or organization_id = public.get_user_organization_id()
);

create policy "Admins can manage gamification participants in org"
on public.gamification_participants
for all
using (
  public.is_super_admin()
  or (
    organization_id = public.get_user_organization_id()
    and public.is_admin()
  )
)
with check (
  public.is_super_admin()
  or (
    organization_id = public.get_user_organization_id()
    and public.is_admin()
  )
);
