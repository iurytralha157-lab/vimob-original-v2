with first_admin as (
  select distinct on (organization_id)
    organization_id,
    id as user_id
  from public.users
  where lower(coalesce(role, '')) in ('admin', 'administrator', 'owner', 'super_admin')
  order by organization_id, created_at asc
)
update public.round_robins rr
set created_by = fa.user_id
from first_admin fa
where rr.created_by is null
  and rr.organization_id = fa.organization_id;
