-- Allow team leaders to manage member availability for their own teams.
-- The UI lets leaders maintain schedules, but the previous RLS policy only
-- allowed admins or users with settings_teams.

drop policy if exists "Admins and team managers can manage member availability" on public.member_availability;

create policy "Admins and team leaders can manage member availability"
on public.member_availability
for all
using (
  exists (
    select 1
    from public.team_members target_tm
    join public.teams t on t.id = target_tm.team_id
    where target_tm.id = member_availability.team_member_id
      and t.organization_id = public.get_user_organization_id()
      and (
        public.is_admin()
        or public.user_has_permission('settings_teams', auth.uid())
        or exists (
          select 1
          from public.team_members leader_tm
          where leader_tm.team_id = target_tm.team_id
            and leader_tm.user_id = auth.uid()
            and coalesce(leader_tm.is_leader, false) = true
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.team_members target_tm
    join public.teams t on t.id = target_tm.team_id
    where target_tm.id = member_availability.team_member_id
      and t.organization_id = public.get_user_organization_id()
      and (
        public.is_admin()
        or public.user_has_permission('settings_teams', auth.uid())
        or exists (
          select 1
          from public.team_members leader_tm
          where leader_tm.team_id = target_tm.team_id
            and leader_tm.user_id = auth.uid()
            and coalesce(leader_tm.is_leader, false) = true
        )
      )
  )
);
