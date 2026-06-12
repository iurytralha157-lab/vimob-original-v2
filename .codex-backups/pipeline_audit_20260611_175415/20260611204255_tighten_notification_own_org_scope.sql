drop policy if exists "Users can view their own notifications" on public.notifications;
drop policy if exists "Users can update their own notifications" on public.notifications;
drop policy if exists "Users can delete their own notifications" on public.notifications;

create policy "Users can view their own notifications"
on public.notifications
for select
to authenticated
using (
  user_id = auth.uid()
  and organization_id = get_user_organization_id()
);

create policy "Users can update their own notifications"
on public.notifications
for update
to authenticated
using (
  user_id = auth.uid()
  and organization_id = get_user_organization_id()
)
with check (
  user_id = auth.uid()
  and organization_id = get_user_organization_id()
);

create policy "Users can delete their own notifications"
on public.notifications
for delete
to authenticated
using (
  user_id = auth.uid()
  and organization_id = get_user_organization_id()
);

drop policy if exists "Users can view their own tokens" on public.push_tokens;
drop policy if exists "Users can delete their own tokens" on public.push_tokens;

create policy "Users can view their own tokens"
on public.push_tokens
for select
to authenticated
using (
  user_id = auth.uid()
  and organization_id = get_user_organization_id()
);

create policy "Users can delete their own tokens"
on public.push_tokens
for delete
to authenticated
using (
  user_id = auth.uid()
  and organization_id = get_user_organization_id()
);
