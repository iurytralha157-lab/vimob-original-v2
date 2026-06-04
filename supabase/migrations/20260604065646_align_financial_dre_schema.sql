create table if not exists public.dre_account_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  group_type text not null,
  display_order integer not null default 0,
  parent_id uuid references public.dre_account_groups(id) on delete cascade,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dre_account_groups_type_check check (
    group_type in (
      'revenue',
      'deduction',
      'cost',
      'expense',
      'financial_expense',
      'financial_revenue',
      'tax'
    )
  )
);

create table if not exists public.dre_account_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.dre_account_groups(id) on delete cascade,
  category text not null,
  entry_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dre_account_mappings_entry_type_check check (entry_type in ('receivable', 'payable')),
  constraint dre_account_mappings_unique unique (organization_id, category, entry_type)
);

create index if not exists idx_dre_account_groups_org_order
  on public.dre_account_groups(organization_id, display_order);

create index if not exists idx_dre_account_mappings_org_group
  on public.dre_account_mappings(organization_id, group_id);

alter table public.dre_account_groups enable row level security;
alter table public.dre_account_mappings enable row level security;

drop policy if exists "Org users can view DRE groups" on public.dre_account_groups;
create policy "Org users can view DRE groups"
  on public.dre_account_groups for select
  using (organization_id = public.get_user_organization_id() or public.is_super_admin());

drop policy if exists "Admins can manage DRE groups" on public.dre_account_groups;
create policy "Admins can manage DRE groups"
  on public.dre_account_groups for all
  using ((organization_id = public.get_user_organization_id() and public.is_admin()) or public.is_super_admin())
  with check ((organization_id = public.get_user_organization_id() and public.is_admin()) or public.is_super_admin());

drop policy if exists "Org users can view DRE mappings" on public.dre_account_mappings;
create policy "Org users can view DRE mappings"
  on public.dre_account_mappings for select
  using (organization_id = public.get_user_organization_id() or public.is_super_admin());

drop policy if exists "Admins can manage DRE mappings" on public.dre_account_mappings;
create policy "Admins can manage DRE mappings"
  on public.dre_account_mappings for all
  using ((organization_id = public.get_user_organization_id() and public.is_admin()) or public.is_super_admin())
  with check ((organization_id = public.get_user_organization_id() and public.is_admin()) or public.is_super_admin());

drop trigger if exists update_dre_account_groups_updated_at on public.dre_account_groups;
create trigger update_dre_account_groups_updated_at
  before update on public.dre_account_groups
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_dre_account_mappings_updated_at on public.dre_account_mappings;
create trigger update_dre_account_mappings_updated_at
  before update on public.dre_account_mappings
  for each row
  execute function public.update_updated_at_column();

create or replace function public.copy_default_dre_groups(org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_group_id uuid;
begin
  if org_id is null then
    raise exception 'org_id is required';
  end if;

  if not public.is_super_admin()
     and not (public.get_user_organization_id() = org_id and public.is_admin()) then
    raise exception 'Usuário sem permissão para configurar DRE';
  end if;

  insert into public.dre_account_groups (organization_id, name, group_type, display_order, is_system)
  values
    (org_id, 'Vendas e comissões recebidas', 'revenue', 10, true),
    (org_id, 'Deduções e estornos', 'deduction', 20, true),
    (org_id, 'Custos operacionais', 'cost', 30, true),
    (org_id, 'Despesas administrativas', 'expense', 40, true),
    (org_id, 'Despesas financeiras', 'financial_expense', 50, true),
    (org_id, 'Receitas financeiras', 'financial_revenue', 60, true),
    (org_id, 'Impostos sobre lucro', 'tax', 70, true)
  on conflict do nothing;

  select id into v_group_id
  from public.dre_account_groups
  where organization_id = org_id and group_type = 'revenue'
  order by display_order
  limit 1;

  if v_group_id is not null then
    insert into public.dre_account_mappings (organization_id, group_id, category, entry_type)
    values
      (org_id, v_group_id, 'Comissões', 'receivable'),
      (org_id, v_group_id, 'Vendas', 'receivable'),
      (org_id, v_group_id, 'Receita', 'receivable')
    on conflict (organization_id, category, entry_type) do nothing;
  end if;

  select id into v_group_id
  from public.dre_account_groups
  where organization_id = org_id and group_type = 'expense'
  order by display_order
  limit 1;

  if v_group_id is not null then
    insert into public.dre_account_mappings (organization_id, group_id, category, entry_type)
    values
      (org_id, v_group_id, 'Marketing', 'payable'),
      (org_id, v_group_id, 'Administrativo', 'payable'),
      (org_id, v_group_id, 'Operacional', 'payable')
    on conflict (organization_id, category, entry_type) do nothing;
  end if;
end;
$function$;

grant execute on function public.copy_default_dre_groups(uuid) to authenticated;
