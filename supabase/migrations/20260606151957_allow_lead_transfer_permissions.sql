drop policy if exists "Lead transfer managers can select organization leads" on public.leads;
create policy "Lead transfer managers can select organization leads"
on public.leads
for select
using (
  organization_id = public.get_user_organization_id()
  and (
    public.user_has_permission('lead_transfer', auth.uid())
    or public.user_has_permission('lead_edit_all', auth.uid())
    or public.user_has_permission('settings_teams', auth.uid())
    or public.user_has_permission('settings_users', auth.uid())
  )
);

drop policy if exists "Lead transfer managers can update organization leads" on public.leads;
create policy "Lead transfer managers can update organization leads"
on public.leads
for update
using (
  organization_id = public.get_user_organization_id()
  and (
    public.user_has_permission('lead_transfer', auth.uid())
    or public.user_has_permission('lead_edit_all', auth.uid())
    or public.user_has_permission('settings_teams', auth.uid())
    or public.user_has_permission('settings_users', auth.uid())
  )
)
with check (
  organization_id = public.get_user_organization_id()
);
