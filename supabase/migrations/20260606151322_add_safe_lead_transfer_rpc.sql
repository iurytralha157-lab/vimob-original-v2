create or replace function public.transfer_lead_assignee(
  p_lead_id uuid,
  p_assigned_user_id uuid
)
returns public.leads
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_org_id uuid;
  v_target_org_id uuid;
  v_lead public.leads%rowtype;
  v_updated_lead public.leads%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  select organization_id
    into v_actor_org_id
  from public.users
  where id = v_actor_id;

  if v_actor_org_id is null then
    raise exception 'Organização do usuário não encontrada';
  end if;

  select *
    into v_lead
  from public.leads
  where id = p_lead_id;

  if not found then
    raise exception 'Lead não encontrado';
  end if;

  if v_lead.organization_id <> v_actor_org_id then
    raise exception 'Lead pertence a outra organização';
  end if;

  if p_assigned_user_id is not null then
    select organization_id
      into v_target_org_id
    from public.users
    where id = p_assigned_user_id
      and coalesce(is_active, true) = true;

    if v_target_org_id is null then
      raise exception 'Responsável não encontrado ou inativo';
    end if;

    if v_target_org_id <> v_lead.organization_id then
      raise exception 'Responsável pertence a outra organização';
    end if;
  end if;

  if not (
    public.is_super_admin()
    or public.is_admin()
    or public.user_has_permission('lead_transfer', v_actor_id)
    or public.user_has_permission('lead_edit_all', v_actor_id)
    or v_lead.assigned_user_id = v_actor_id
    or (
      public.is_team_leader(v_actor_id)
      and (
        v_lead.pipeline_id in (select public.get_user_led_pipeline_ids())
        or v_lead.assigned_user_id in (
          select tm.user_id
          from public.team_members tm
          where tm.team_id in (select public.get_user_led_team_ids())
        )
      )
    )
  ) then
    raise exception 'Sem permissão para transferir este lead';
  end if;

  update public.leads
     set assigned_user_id = p_assigned_user_id,
         assigned_at = case when p_assigned_user_id is null then null else now() end,
         updated_at = now()
   where id = p_lead_id
   returning * into v_updated_lead;

  return v_updated_lead;
end;
$function$;

grant execute on function public.transfer_lead_assignee(uuid, uuid) to authenticated;
