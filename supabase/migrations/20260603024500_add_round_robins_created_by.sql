alter table public.round_robins
  add column if not exists created_by uuid references public.users(id) on delete set null;

create index if not exists idx_round_robins_created_by
  on public.round_robins(created_by);
