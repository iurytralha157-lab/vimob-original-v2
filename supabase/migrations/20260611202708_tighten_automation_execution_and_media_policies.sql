-- Tighten the riskiest automation policies without changing normal app workflows.

-- 1) automation_executions: replace broad org-wide ALL policy with narrower operations.
drop policy if exists "System can manage automation executions" on public.automation_executions;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'automation_executions'
      and policyname = 'Users can start automation executions'
  ) then
    create policy "Users can start automation executions"
      on public.automation_executions
      for insert
      with check (organization_id = public.get_user_organization_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'automation_executions'
      and policyname = 'Users can cancel running automation executions'
  ) then
    create policy "Users can cancel running automation executions"
      on public.automation_executions
      for update
      using (
        organization_id = public.get_user_organization_id()
        and status in ('running', 'waiting')
      )
      with check (
        organization_id = public.get_user_organization_id()
        and status = 'cancelled'
      );
  end if;
end $$;

-- 2) automation-media: keep org-scoped management policy and public bucket behavior,
-- but remove metadata/listing access for every authenticated user across all orgs.
drop policy if exists "Anyone can view automation media" on storage.objects;
