alter table public.onboarding_requests
  add column if not exists creci text;

alter table public.organizations
  add column if not exists creci text;
