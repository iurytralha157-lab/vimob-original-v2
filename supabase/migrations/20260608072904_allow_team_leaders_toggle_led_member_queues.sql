-- Allow team leaders to toggle/edit queues that are assigned to their led
-- team members, including older queues where round_robin_members.team_id is null.

drop policy if exists "Team leaders can update round robins for led pipelines" on public.round_robins;
create policy "Team leaders can update round robins for led pipelines"
on public.round_robins
for update
using (
  organization_id = public.get_user_organization_id()
  and target_pipeline_id is not null
  and public.can_manage_round_robin_as_leader(id, auth.uid())
)
with check (
  organization_id = public.get_user_organization_id()
  and target_pipeline_id is not null
  and public.can_manage_round_robin_as_leader(id, auth.uid())
);

drop policy if exists "Team leaders can delete round robins for led pipelines" on public.round_robins;
create policy "Team leaders can delete round robins for led pipelines"
on public.round_robins
for delete
using (
  organization_id = public.get_user_organization_id()
  and target_pipeline_id is not null
  and public.can_manage_round_robin_as_leader(id, auth.uid())
);
