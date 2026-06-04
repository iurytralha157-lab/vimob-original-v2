-- =====================================================
-- Execute este SQL no SQL Editor do Supabase
-- =====================================================
-- 1) Comentários de eventos da agenda
-- 2) Tabela de múltiplos responsáveis por evento
-- =====================================================

-- ============ COMMENTS ============
create table if not exists public.schedule_event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.schedule_events(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.schedule_event_comments enable row level security;

drop policy if exists "view_schedule_comments_org" on public.schedule_event_comments;
create policy "view_schedule_comments_org"
on public.schedule_event_comments
for select to authenticated
using (organization_id = (select organization_id from public.users where id = auth.uid()));

drop policy if exists "insert_schedule_comments_org" on public.schedule_event_comments;
create policy "insert_schedule_comments_org"
on public.schedule_event_comments
for insert to authenticated
with check (
  organization_id = (select organization_id from public.users where id = auth.uid())
  and user_id = auth.uid()
);

drop policy if exists "delete_own_schedule_comments" on public.schedule_event_comments;
create policy "delete_own_schedule_comments"
on public.schedule_event_comments
for delete to authenticated
using (user_id = auth.uid());

create index if not exists idx_schedule_comments_event_id on public.schedule_event_comments(event_id);
create index if not exists idx_schedule_comments_org_id on public.schedule_event_comments(organization_id);


-- ============ ASSIGNEES (múltiplos responsáveis) ============
create table if not exists public.schedule_event_assignees (
  event_id uuid not null references public.schedule_events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.schedule_event_assignees enable row level security;

drop policy if exists "view_schedule_assignees_org" on public.schedule_event_assignees;
create policy "view_schedule_assignees_org"
on public.schedule_event_assignees
for select to authenticated
using (organization_id = (select organization_id from public.users where id = auth.uid()));

drop policy if exists "manage_schedule_assignees_org" on public.schedule_event_assignees;
create policy "manage_schedule_assignees_org"
on public.schedule_event_assignees
for all to authenticated
using (organization_id = (select organization_id from public.users where id = auth.uid()))
with check (organization_id = (select organization_id from public.users where id = auth.uid()));

create index if not exists idx_schedule_assignees_event on public.schedule_event_assignees(event_id);
create index if not exists idx_schedule_assignees_user on public.schedule_event_assignees(user_id);

-- Migrar responsáveis existentes (user_id do evento -> assignee padrão)
insert into public.schedule_event_assignees (event_id, user_id, organization_id)
select id, user_id, organization_id
from public.schedule_events
where user_id is not null
on conflict do nothing;
