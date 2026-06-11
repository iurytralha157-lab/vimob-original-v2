-- Remove lead phone data from broker-facing notifications.
-- Phone numbers can still be stored on leads and used for routing/contact,
-- but notification content and logs must not receive lead phone variables.

update public.notification_templates
set
  message = 'Novo lead atribuido a voce

Lead: {lead_name}
Origem: {source}
Pipeline: {pipeline_name}

Acesse o CRM para atender esse lead.',
  variables = array['lead_name', 'source', 'pipeline_name']::text[],
  updated_at = now()
where slug = 'lead_assigned_to_user';

update public.notification_templates
set
  message = 'Lead transferido para voce

Lead: {lead_name}
Pipeline: {pipeline_name}
Transferido de: {old_user_name}

Acesse o CRM para atender esse lead.',
  variables = array['lead_name', 'pipeline_name', 'old_user_name']::text[],
  updated_at = now()
where slug = 'lead_transferred_to_user';

create or replace function public.notify_new_lead()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_pipeline_name text;
  v_source_label text;
  v_assigned_user_name text;
  v_user record;
  v_notified uuid[] := array[]::uuid[];
  v_is_new_assignment boolean := false;
  v_supabase_url text;
  v_service_key text;
begin
  if TG_OP = 'INSERT' then
    v_is_new_assignment := NEW.assigned_user_id is not null;
  elsif TG_OP = 'UPDATE' then
    v_is_new_assignment := OLD.assigned_user_id is null and NEW.assigned_user_id is not null;
  end if;

  if not v_is_new_assignment then
    return NEW;
  end if;

  select name into v_pipeline_name from public.pipelines where id = NEW.pipeline_id;
  select name into v_assigned_user_name from public.users where id = NEW.assigned_user_id;

  v_source_label := case NEW.source
    when 'whatsapp' then 'WhatsApp'
    when 'webhook' then 'Webhook'
    when 'facebook' then 'Facebook Ads'
    when 'instagram' then 'Instagram Ads'
    when 'website' then 'Site'
    when 'manual' then 'Manual'
    when 'meta' then 'Meta Ads'
    when 'meta_ads' then 'Meta Ads'
    when 'wordpress' then 'WordPress'
    else coalesce(NEW.source, 'Nao informada')
  end;

  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);
  if v_supabase_url is null or v_supabase_url = '' then
    v_supabase_url := 'https://iemalzlfnbouobyjwlwi.supabase.co';
  end if;

  begin
    perform net.http_post(
      url := v_supabase_url || '/functions/v1/notification-dispatcher',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(v_service_key, '')
      ),
      body := jsonb_build_object(
        'event_key', 'lead_assigned_to_user',
        'organization_id', NEW.organization_id,
        'user_id', NEW.assigned_user_id,
        'lead_id', NEW.id,
        'dedupe_key', 'lead_assigned_to_user:' || NEW.id::text || ':' || NEW.assigned_user_id::text,
        'variables', jsonb_build_object(
          'lead_name', coalesce(NEW.name, 'Sem nome'),
          'source', v_source_label,
          'pipeline_name', coalesce(v_pipeline_name, 'Padrao')
        )
      )
    );
  exception when others then
    raise notice 'Falha ao disparar notification-dispatcher para novo lead: %', SQLERRM;
  end;

  v_notified := array_append(v_notified, NEW.assigned_user_id);

  for v_user in
    select id
    from public.users
    where organization_id = NEW.organization_id
      and role = 'admin'
      and not (id = any(v_notified))
  loop
    perform public.create_notification(
      v_user.id,
      NEW.organization_id,
      'Novo lead no CRM',
      'Lead "' || coalesce(NEW.name, 'Sem nome') || '" | Origem: ' || v_source_label || ' | Responsavel: ' || coalesce(v_assigned_user_name, 'Nao atribuido') || ' | Pipeline: ' || coalesce(v_pipeline_name, 'Padrao') || '.',
      'lead',
      NEW.id
    );
    v_notified := array_append(v_notified, v_user.id);
  end loop;

  for v_user in
    select distinct tm.user_id as uid
    from public.team_pipelines tp
    join public.team_members tm on tm.team_id = tp.team_id
    where tp.pipeline_id = NEW.pipeline_id
      and tm.is_leader = true
      and not (tm.user_id = any(v_notified))
  loop
    perform public.create_notification(
      v_user.uid,
      NEW.organization_id,
      'Novo lead na sua equipe',
      'Lead "' || coalesce(NEW.name, 'Sem nome') || '" | Origem: ' || v_source_label || ' | Responsavel: ' || coalesce(v_assigned_user_name, 'Nao atribuido') || ' | Pipeline: ' || coalesce(v_pipeline_name, 'Padrao') || '.',
      'lead',
      NEW.id
    );
    v_notified := array_append(v_notified, v_user.uid);
  end loop;

  return NEW;
end;
$$;

create or replace function public.notify_lead_assigned()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_old_user_name text;
  v_pipeline_name text;
  v_supabase_url text;
  v_service_key text;
begin
  if NEW.assigned_user_id is null then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    return NEW;
  end if;

  if OLD.assigned_user_id is not distinct from NEW.assigned_user_id then
    return NEW;
  end if;

  -- First assignment is handled by notify_new_lead.
  if OLD.assigned_user_id is null then
    return NEW;
  end if;

  select name into v_old_user_name from public.users where id = OLD.assigned_user_id;
  select name into v_pipeline_name from public.pipelines where id = NEW.pipeline_id;

  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);
  if v_supabase_url is null or v_supabase_url = '' then
    v_supabase_url := 'https://iemalzlfnbouobyjwlwi.supabase.co';
  end if;

  begin
    perform net.http_post(
      url := v_supabase_url || '/functions/v1/notification-dispatcher',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(v_service_key, '')
      ),
      body := jsonb_build_object(
        'event_key', 'lead_transferred_to_user',
        'organization_id', NEW.organization_id,
        'user_id', NEW.assigned_user_id,
        'lead_id', NEW.id,
        'dedupe_key', 'lead_transferred_to_user:' || NEW.id::text || ':' || NEW.assigned_user_id::text || ':' || coalesce(OLD.assigned_user_id::text, ''),
        'variables', jsonb_build_object(
          'lead_name', coalesce(NEW.name, 'Sem nome'),
          'pipeline_name', coalesce(v_pipeline_name, 'Padrao'),
          'old_user_name', coalesce(v_old_user_name, 'outro usuario')
        )
      )
    );
  exception when others then
    raise notice 'Falha ao disparar notification-dispatcher para transferencia de lead: %', SQLERRM;
  end;

  return NEW;
end;
$$;
