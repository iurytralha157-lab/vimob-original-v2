alter table public.teams
  add column if not exists is_active boolean not null default true,
  add column if not exists logo_url text,
  add column if not exists created_by uuid references public.users(id) on delete set null;

create index if not exists idx_teams_org_active on public.teams (organization_id, is_active);

update public.teams
set is_active = true
where is_active is distinct from true;
