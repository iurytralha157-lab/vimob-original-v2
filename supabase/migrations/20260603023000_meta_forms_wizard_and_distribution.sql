alter table public.meta_form_configs
  add column if not exists round_robin_id uuid references public.round_robins(id) on delete set null,
  add column if not exists purpose text,
  add column if not exists source text,
  add column if not exists source_details text,
  add column if not exists default_values jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references public.users(id) on delete set null;

alter table public.meta_integrations
  add column if not exists facebook_user_id text,
  add column if not exists facebook_user_name text,
  add column if not exists page_picture_url text;

create index if not exists idx_meta_form_configs_round_robin_id
  on public.meta_form_configs(round_robin_id);

create index if not exists idx_meta_integrations_facebook_user_id
  on public.meta_integrations(facebook_user_id);
