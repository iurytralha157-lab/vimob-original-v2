alter table public.users
  add column if not exists theme_preference text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_theme_preference_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_theme_preference_check
      check (theme_preference is null or theme_preference in ('light', 'dark'));
  end if;
end $$;

comment on column public.users.theme_preference is
  'Optional per-user UI theme preference. Supported values: light, dark.';
