alter table public.gamification_missions enable row level security;

grant select, insert, update, delete on public.gamification_missions to authenticated;

drop policy if exists "Users can view missions of their organization"
  on public.gamification_missions;
drop policy if exists "Admins can manage missions for their organization"
  on public.gamification_missions;
drop policy if exists "Admins can insert gamification missions in org"
  on public.gamification_missions;
drop policy if exists "Admins can update gamification missions in org"
  on public.gamification_missions;
drop policy if exists "Admins can delete gamification missions in org"
  on public.gamification_missions;

create policy "Users can view missions of their organization"
on public.gamification_missions
for select
to authenticated
using (
  organization_id = public.get_user_organization_id()
  or public.is_super_admin()
);

create policy "Admins can insert gamification missions in org"
on public.gamification_missions
for insert
to authenticated
with check (
  (
    organization_id = public.get_user_organization_id()
    and public.is_admin()
  )
  or public.is_super_admin()
);

create policy "Admins can update gamification missions in org"
on public.gamification_missions
for update
to authenticated
using (
  (
    organization_id = public.get_user_organization_id()
    and public.is_admin()
  )
  or public.is_super_admin()
)
with check (
  (
    organization_id = public.get_user_organization_id()
    and public.is_admin()
  )
  or public.is_super_admin()
);

create policy "Admins can delete gamification missions in org"
on public.gamification_missions
for delete
to authenticated
using (
  (
    organization_id = public.get_user_organization_id()
    and public.is_admin()
  )
  or public.is_super_admin()
);
