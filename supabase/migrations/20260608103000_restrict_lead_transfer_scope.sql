CREATE OR REPLACE FUNCTION public.transfer_lead_assignee(p_lead_id uuid, p_assigned_user_id uuid)
RETURNS public.leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_org_id uuid;
  v_target_org_id uuid;
  v_lead public.leads%rowtype;
  v_updated_lead public.leads%rowtype;
  v_is_privileged boolean := false;
  v_is_leader_allowed boolean := false;
begin
  if v_actor_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select organization_id
    into v_actor_org_id
  from public.users
  where id = v_actor_id;

  if v_actor_org_id is null then
    raise exception 'Organizacao do usuario nao encontrada';
  end if;

  select *
    into v_lead
  from public.leads
  where id = p_lead_id;

  if not found then
    raise exception 'Lead nao encontrado';
  end if;

  if v_lead.organization_id <> v_actor_org_id then
    raise exception 'Lead pertence a outra organizacao';
  end if;

  if p_assigned_user_id is not null then
    select organization_id
      into v_target_org_id
    from public.users
    where id = p_assigned_user_id
      and coalesce(is_active, true) = true;

    if v_target_org_id is null then
      raise exception 'Responsavel nao encontrado ou inativo';
    end if;

    if v_target_org_id <> v_lead.organization_id then
      raise exception 'Responsavel pertence a outra organizacao';
    end if;
  end if;

  v_is_privileged :=
    public.is_super_admin()
    or public.is_admin()
    or public.user_has_permission('lead_transfer', v_actor_id)
    or public.user_has_permission('lead_edit_all', v_actor_id)
    or public.user_has_permission('settings_teams', v_actor_id)
    or public.user_has_permission('settings_users', v_actor_id);

  if public.is_team_leader(v_actor_id) then
    v_is_leader_allowed :=
      (
        v_lead.pipeline_id in (select public.get_user_led_pipeline_ids())
        or v_lead.assigned_user_id in (
          select tm.user_id
          from public.team_members tm
          where tm.team_id in (select public.get_user_led_team_ids())
        )
      )
      and (
        p_assigned_user_id is null
        or p_assigned_user_id in (
          select tm.user_id
          from public.team_members tm
          where tm.team_id in (select public.get_user_led_team_ids())
        )
      );
  end if;

  if not (v_is_privileged or v_is_leader_allowed) then
    raise exception 'Sem permissao para transferir este lead';
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
