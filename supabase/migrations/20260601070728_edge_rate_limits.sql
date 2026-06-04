create table if not exists public.edge_rate_limits (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  identifier_hash text not null,
  window_start timestamptz not null,
  window_seconds integer not null,
  request_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, identifier_hash, window_start)
);

alter table public.edge_rate_limits enable row level security;

revoke all on table public.edge_rate_limits from anon, authenticated;
grant all on table public.edge_rate_limits to service_role;

create index if not exists edge_rate_limits_cleanup_idx
  on public.edge_rate_limits (window_start);

create or replace function public.check_edge_rate_limit(
  p_scope text,
  p_identifier_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count integer;
  v_retry_after integer;
begin
  if p_scope is null or length(trim(p_scope)) = 0 then
    raise exception 'p_scope is required';
  end if;

  if p_identifier_hash is null or length(trim(p_identifier_hash)) = 0 then
    raise exception 'p_identifier_hash is required';
  end if;

  if p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'p_limit and p_window_seconds must be positive';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.edge_rate_limits (
    scope,
    identifier_hash,
    window_start,
    window_seconds,
    request_count
  )
  values (
    p_scope,
    p_identifier_hash,
    v_window_start,
    p_window_seconds,
    1
  )
  on conflict (scope, identifier_hash, window_start)
  do update set
    request_count = public.edge_rate_limits.request_count + 1,
    updated_at = now()
  returning request_count into v_count;

  v_retry_after := greatest(
    1,
    ceil(extract(epoch from (v_window_start + (p_window_seconds * interval '1 second') - now())))::integer
  );

  return query
  select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    case when v_count > p_limit then v_retry_after else 0 end;
end;
$$;

revoke all on function public.check_edge_rate_limit(text, text, integer, integer) from public;
grant execute on function public.check_edge_rate_limit(text, text, integer, integer) to service_role;
