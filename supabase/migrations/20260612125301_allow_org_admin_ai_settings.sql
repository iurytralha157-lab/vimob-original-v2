-- Allow organization admins to manage their own Jhenny configuration.
-- Global agent editing remains super-admin only; org admins can only read active agents
-- so the org-scoped settings screen can resolve agent_id safely.

drop policy if exists "org admins view active ai global agents" on public.ai_global_agents;
create policy "org admins view active ai global agents"
  on public.ai_global_agents
  for select
  to authenticated
  using (is_active = true and public.is_admin());

drop policy if exists "org admins insert own ai org settings" on public.ai_organization_settings;
create policy "org admins insert own ai org settings"
  on public.ai_organization_settings
  for insert
  to authenticated
  with check (
    public.user_belongs_to_organization(organization_id)
    and public.is_admin()
  );

drop policy if exists "org admins update own ai org settings" on public.ai_organization_settings;
create policy "org admins update own ai org settings"
  on public.ai_organization_settings
  for update
  to authenticated
  using (
    public.user_belongs_to_organization(organization_id)
    and public.is_admin()
  )
  with check (
    public.user_belongs_to_organization(organization_id)
    and public.is_admin()
  );
