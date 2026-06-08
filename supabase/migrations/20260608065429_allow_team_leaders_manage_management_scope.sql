-- Allow team leaders to manage only their own management scope.
-- Leaders can edit led teams, manage non-leader team members, maintain
-- availability, and create/edit distribution queues for their led teams.

create or replace function public.is_user_leader_of_team(p_team_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.team_id = p_team_id
      and tm.user_id = p_user_id
      and coalesce(tm.is_leader, false) = true
      and coalesce(t.is_active, true) = true
      and t.organization_id = public.get_user_organization_id()
  );
$$;

create or replace function public.is_user_in_led_team(p_target_user_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members leader_tm
    join public.teams t on t.id = leader_tm.team_id
    join public.team_members target_tm on target_tm.team_id = leader_tm.team_id
    where leader_tm.user_id = p_user_id
      and coalesce(leader_tm.is_leader, false) = true
      and target_tm.user_id = p_target_user_id
      and coalesce(t.is_active, true) = true
      and t.organization_id = public.get_user_organization_id()
  );
$$;

create or replace function public.is_pipeline_in_led_team(p_pipeline_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    join public.team_pipelines tp on tp.team_id = tm.team_id
    where tm.user_id = p_user_id
      and coalesce(tm.is_leader, false) = true
      and coalesce(t.is_active, true) = true
      and t.organization_id = public.get_user_organization_id()
      and tp.pipeline_id = p_pipeline_id
  );
$$;

create or replace function public.can_manage_round_robin_as_leader(p_round_robin_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.round_robins rr
    where rr.id = p_round_robin_id
      and rr.organization_id = public.get_user_organization_id()
      and rr.target_pipeline_id is not null
      and (
        (
          rr.created_by = p_user_id
          and public.is_team_leader(p_user_id)
        )
        or
        public.is_pipeline_in_led_team(rr.target_pipeline_id, p_user_id)
        or exists (
          select 1
          from public.round_robin_members rrm
          where rrm.round_robin_id = rr.id
            and (
              (rrm.team_id is not null and public.is_user_leader_of_team(rrm.team_id, p_user_id))
              or (rrm.team_id is null and public.is_user_in_led_team(rrm.user_id, p_user_id))
            )
        )
      )
  );
$$;

drop policy if exists "Team leaders can update led teams" on public.teams;
create policy "Team leaders can update led teams"
on public.teams
for update
using (
  organization_id = public.get_user_organization_id()
  and public.is_user_leader_of_team(id, auth.uid())
)
with check (
  organization_id = public.get_user_organization_id()
  and public.is_user_leader_of_team(id, auth.uid())
);

drop policy if exists "Team leaders can insert non leader members in led teams" on public.team_members;
create policy "Team leaders can insert non leader members in led teams"
on public.team_members
for insert
with check (
  public.is_user_leader_of_team(team_id, auth.uid())
  and coalesce(is_leader, false) = false
  and exists (
    select 1
    from public.users u
    where u.id = team_members.user_id
      and u.organization_id = public.get_user_organization_id()
      and coalesce(u.is_active, true) = true
  )
);

drop policy if exists "Team leaders can update non leader members in led teams" on public.team_members;
create policy "Team leaders can update non leader members in led teams"
on public.team_members
for update
using (
  public.is_user_leader_of_team(team_id, auth.uid())
  and coalesce(is_leader, false) = false
)
with check (
  public.is_user_leader_of_team(team_id, auth.uid())
  and coalesce(is_leader, false) = false
  and exists (
    select 1
    from public.users u
    where u.id = team_members.user_id
      and u.organization_id = public.get_user_organization_id()
      and coalesce(u.is_active, true) = true
  )
);

drop policy if exists "Team leaders can delete non leader members in led teams" on public.team_members;
create policy "Team leaders can delete non leader members in led teams"
on public.team_members
for delete
using (
  public.is_user_leader_of_team(team_id, auth.uid())
  and coalesce(is_leader, false) = false
);

drop policy if exists "Team leaders can insert round robins for led pipelines" on public.round_robins;
create policy "Team leaders can insert round robins for led pipelines"
on public.round_robins
for insert
with check (
  organization_id = public.get_user_organization_id()
  and created_by = auth.uid()
  and target_pipeline_id is not null
  and public.is_team_leader(auth.uid())
  and exists (
    select 1
    from public.pipelines p
    where p.id = round_robins.target_pipeline_id
      and p.organization_id = public.get_user_organization_id()
  )
);

drop policy if exists "Team leaders can update round robins for led pipelines" on public.round_robins;
create policy "Team leaders can update round robins for led pipelines"
on public.round_robins
for update
using (
  organization_id = public.get_user_organization_id()
  and target_pipeline_id is not null
  and public.is_pipeline_in_led_team(target_pipeline_id, auth.uid())
)
with check (
  organization_id = public.get_user_organization_id()
  and target_pipeline_id is not null
  and public.is_pipeline_in_led_team(target_pipeline_id, auth.uid())
);

drop policy if exists "Team leaders can delete round robins for led pipelines" on public.round_robins;
create policy "Team leaders can delete round robins for led pipelines"
on public.round_robins
for delete
using (
  organization_id = public.get_user_organization_id()
  and target_pipeline_id is not null
  and public.is_pipeline_in_led_team(target_pipeline_id, auth.uid())
);

drop policy if exists "Team leaders can insert round robin rules for led queues" on public.round_robin_rules;
create policy "Team leaders can insert round robin rules for led queues"
on public.round_robin_rules
for insert
with check (
  public.can_manage_round_robin_as_leader(round_robin_id, auth.uid())
);

drop policy if exists "Team leaders can update round robin rules for led queues" on public.round_robin_rules;
create policy "Team leaders can update round robin rules for led queues"
on public.round_robin_rules
for update
using (
  public.can_manage_round_robin_as_leader(round_robin_id, auth.uid())
)
with check (
  public.can_manage_round_robin_as_leader(round_robin_id, auth.uid())
);

drop policy if exists "Team leaders can delete round robin rules for led queues" on public.round_robin_rules;
create policy "Team leaders can delete round robin rules for led queues"
on public.round_robin_rules
for delete
using (
  public.can_manage_round_robin_as_leader(round_robin_id, auth.uid())
);

drop policy if exists "Team leaders can insert round robin members for led queues" on public.round_robin_members;
create policy "Team leaders can insert round robin members for led queues"
on public.round_robin_members
for insert
with check (
  public.can_manage_round_robin_as_leader(round_robin_id, auth.uid())
  and (
    (team_id is not null and public.is_user_leader_of_team(team_id, auth.uid()) and public.is_user_in_led_team(user_id, auth.uid()))
    or
    (team_id is null and public.is_user_in_led_team(user_id, auth.uid()))
  )
);

drop policy if exists "Team leaders can update round robin members for led queues" on public.round_robin_members;
create policy "Team leaders can update round robin members for led queues"
on public.round_robin_members
for update
using (
  public.can_manage_round_robin_as_leader(round_robin_id, auth.uid())
  and public.is_user_in_led_team(user_id, auth.uid())
)
with check (
  public.can_manage_round_robin_as_leader(round_robin_id, auth.uid())
  and (
    (team_id is not null and public.is_user_leader_of_team(team_id, auth.uid()) and public.is_user_in_led_team(user_id, auth.uid()))
    or
    (team_id is null and public.is_user_in_led_team(user_id, auth.uid()))
  )
);

drop policy if exists "Team leaders can delete round robin members for led queues" on public.round_robin_members;
create policy "Team leaders can delete round robin members for led queues"
on public.round_robin_members
for delete
using (
  public.can_manage_round_robin_as_leader(round_robin_id, auth.uid())
  and public.is_user_in_led_team(user_id, auth.uid())
);
