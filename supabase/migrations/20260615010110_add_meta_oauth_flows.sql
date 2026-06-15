create table if not exists public.meta_oauth_flows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  nonce text not null,
  return_url text not null,
  status text not null default 'pending'
    check (status in ('pending', 'success', 'error', 'consumed')),
  payload jsonb,
  error_message text,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(return_url) <= 2048)
);

create unique index if not exists uq_meta_oauth_flows_id_nonce
  on public.meta_oauth_flows(id, nonce);

create index if not exists idx_meta_oauth_flows_user_expires
  on public.meta_oauth_flows(user_id, expires_at desc);

create index if not exists idx_meta_oauth_flows_org_created
  on public.meta_oauth_flows(organization_id, created_at desc);

alter table public.meta_oauth_flows enable row level security;

revoke all on table public.meta_oauth_flows from anon, authenticated;

drop trigger if exists update_meta_oauth_flows_updated_at on public.meta_oauth_flows;

create trigger update_meta_oauth_flows_updated_at
  before update on public.meta_oauth_flows
  for each row execute function public.update_updated_at_column();

comment on table public.meta_oauth_flows is
  'Short-lived server-side storage for Meta OAuth callback payloads. Keeps page tokens and large page lists out of redirect URLs.';
