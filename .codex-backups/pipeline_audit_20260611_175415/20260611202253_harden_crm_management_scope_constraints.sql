-- Harden CRM management scope and prevent duplicate operational mappings.
--
-- This migration is intentionally narrow:
-- 1. Team leaders may only create distribution queues for pipelines linked to
--    teams they lead.
-- 2. Team membership and team/pipeline mapping cannot be duplicated.
-- 3. Tag names cannot be duplicated inside the same organization when compared
--    case-insensitively after trimming whitespace.

drop policy if exists "Team leaders can insert round robins for led pipelines"
  on public.round_robins;

create policy "Team leaders can insert round robins for led pipelines"
on public.round_robins
for insert
with check (
  organization_id = public.get_user_organization_id()
  and created_by = auth.uid()
  and target_pipeline_id is not null
  and public.is_team_leader(auth.uid())
  and public.is_pipeline_in_led_team(target_pipeline_id, auth.uid())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_members_team_id_user_id_key'
      and conrelid = 'public.team_members'::regclass
  ) then
    alter table public.team_members
      add constraint team_members_team_id_user_id_key unique (team_id, user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_pipelines_team_id_pipeline_id_key'
      and conrelid = 'public.team_pipelines'::regclass
  ) then
    alter table public.team_pipelines
      add constraint team_pipelines_team_id_pipeline_id_key unique (team_id, pipeline_id);
  end if;
end $$;

create unique index if not exists tags_org_normalized_name_key
  on public.tags (organization_id, lower(btrim(name)));
