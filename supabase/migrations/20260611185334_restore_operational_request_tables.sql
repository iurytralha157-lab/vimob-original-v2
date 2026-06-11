create table if not exists public.operational_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  project_id uuid references public.construction_projects(id) on delete set null,
  type text not null default 'finance',
  status text not null default 'pending',
  priority text not null default 'medium',
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  assignee_id uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  due_date timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_requests_type_check
    check (type in ('finance', 'architecture', 'engineering', 'purchase')),
  constraint operational_requests_status_check
    check (status in ('pending', 'in_analysis', 'approved', 'rejected', 'completed')),
  constraint operational_requests_priority_check
    check (priority in ('low', 'medium', 'high', 'urgent'))
);

create table if not exists public.operational_timelines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  project_id uuid references public.construction_projects(id) on delete cascade,
  request_id uuid references public.operational_requests(id) on delete cascade,
  event_type text not null,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_operational_requests_org
  on public.operational_requests(organization_id);
create index if not exists idx_operational_requests_lead
  on public.operational_requests(lead_id);
create index if not exists idx_operational_requests_project
  on public.operational_requests(project_id);
create index if not exists idx_operational_requests_assignee
  on public.operational_requests(assignee_id);
create index if not exists idx_operational_requests_status
  on public.operational_requests(status);
create index if not exists idx_operational_requests_due_date
  on public.operational_requests(due_date);

create index if not exists idx_operational_timelines_org
  on public.operational_timelines(organization_id);
create index if not exists idx_operational_timelines_lead
  on public.operational_timelines(lead_id);
create index if not exists idx_operational_timelines_project
  on public.operational_timelines(project_id);
create index if not exists idx_operational_timelines_request
  on public.operational_timelines(request_id);
create index if not exists idx_operational_timelines_created_at
  on public.operational_timelines(created_at desc);

alter table public.operational_requests enable row level security;
alter table public.operational_timelines enable row level security;

drop policy if exists "Users can view operational requests from their organization"
  on public.operational_requests;
create policy "Users can view operational requests from their organization"
  on public.operational_requests
  for select
  using (organization_id = public.get_user_organization_id());

drop policy if exists "Users can create operational requests in their organization"
  on public.operational_requests;
create policy "Users can create operational requests in their organization"
  on public.operational_requests
  for insert
  with check (organization_id = public.get_user_organization_id());

drop policy if exists "Users can update operational requests from their organization"
  on public.operational_requests;
create policy "Users can update operational requests from their organization"
  on public.operational_requests
  for update
  using (organization_id = public.get_user_organization_id())
  with check (organization_id = public.get_user_organization_id());

drop policy if exists "Users can delete operational requests from their organization"
  on public.operational_requests;
create policy "Users can delete operational requests from their organization"
  on public.operational_requests
  for delete
  using (organization_id = public.get_user_organization_id());

drop policy if exists "Users can view operational timelines from their organization"
  on public.operational_timelines;
create policy "Users can view operational timelines from their organization"
  on public.operational_timelines
  for select
  using (organization_id = public.get_user_organization_id());

drop policy if exists "Users can create operational timelines in their organization"
  on public.operational_timelines;
create policy "Users can create operational timelines in their organization"
  on public.operational_timelines
  for insert
  with check (organization_id = public.get_user_organization_id());

drop policy if exists "Users can update operational timelines from their organization"
  on public.operational_timelines;
create policy "Users can update operational timelines from their organization"
  on public.operational_timelines
  for update
  using (organization_id = public.get_user_organization_id())
  with check (organization_id = public.get_user_organization_id());

drop policy if exists "Users can delete operational timelines from their organization"
  on public.operational_timelines;
create policy "Users can delete operational timelines from their organization"
  on public.operational_timelines
  for delete
  using (organization_id = public.get_user_organization_id());

drop trigger if exists update_operational_requests_updated_at on public.operational_requests;
create trigger update_operational_requests_updated_at
  before update on public.operational_requests
  for each row
  execute function public.update_updated_at_column();
