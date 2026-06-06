drop policy if exists "Admins can manage teams" on public.teams;
create policy "Admins and team managers can manage teams"
on public.teams
for all
using (
  organization_id = public.get_user_organization_id()
  and (
    public.is_admin()
    or public.user_has_permission('settings_teams', auth.uid())
  )
)
with check (
  organization_id = public.get_user_organization_id()
  and (
    public.is_admin()
    or public.user_has_permission('settings_teams', auth.uid())
  )
);

drop policy if exists "Admins can manage team members" on public.team_members;
create policy "Admins and team managers can manage team members"
on public.team_members
for all
using (
  team_id in (
    select t.id
    from public.teams t
    where t.organization_id = public.get_user_organization_id()
  )
  and (
    public.is_admin()
    or public.user_has_permission('settings_teams', auth.uid())
  )
)
with check (
  team_id in (
    select t.id
    from public.teams t
    where t.organization_id = public.get_user_organization_id()
  )
  and (
    public.is_admin()
    or public.user_has_permission('settings_teams', auth.uid())
  )
);

drop policy if exists "Admins can manage team pipelines" on public.team_pipelines;
create policy "Admins and pipeline managers can manage team pipelines"
on public.team_pipelines
for all
using (
  team_id in (
    select t.id
    from public.teams t
    where t.organization_id = public.get_user_organization_id()
  )
  and (
    public.is_admin()
    or public.user_has_permission('settings_pipelines', auth.uid())
    or public.user_has_permission('settings_teams', auth.uid())
  )
)
with check (
  team_id in (
    select t.id
    from public.teams t
    where t.organization_id = public.get_user_organization_id()
  )
  and (
    public.is_admin()
    or public.user_has_permission('settings_pipelines', auth.uid())
    or public.user_has_permission('settings_teams', auth.uid())
  )
);

drop policy if exists "Admins can manage member availability" on public.member_availability;
create policy "Admins and team managers can manage member availability"
on public.member_availability
for all
using (
  exists (
    select 1
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.id = member_availability.team_member_id
      and t.organization_id = public.get_user_organization_id()
      and (
        public.is_admin()
        or public.user_has_permission('settings_teams', auth.uid())
      )
  )
)
with check (
  exists (
    select 1
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.id = member_availability.team_member_id
      and t.organization_id = public.get_user_organization_id()
      and (
        public.is_admin()
        or public.user_has_permission('settings_teams', auth.uid())
      )
  )
);
