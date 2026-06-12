-- Remove legacy permissive policies from gamification_participants.
-- The previous hardening migration dropped known policy names, but the live
-- database still had at least one older policy allowing regular users to write.

alter table public.gamification_participants enable row level security;

do $$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'gamification_participants'
  loop
    execute format(
      'drop policy if exists %I on public.gamification_participants',
      v_policy.policyname
    );
  end loop;
end $$;

grant select, insert, update, delete on public.gamification_participants to authenticated;

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
