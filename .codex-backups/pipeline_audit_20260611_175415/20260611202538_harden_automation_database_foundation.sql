-- Harden automation database foundation without changing product behavior.
-- Scope: integrity constraints, operational indexes, token-free internal pg_net calls.

-- 1) Integrity defaults and NOT NULL constraints where production data is already clean.
alter table public.automations
  alter column organization_id set not null,
  alter column trigger_config set default '{}'::jsonb,
  alter column trigger_config set not null,
  alter column is_active set default true,
  alter column is_active set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.automation_nodes
  alter column automation_id set not null,
  alter column node_config set default '{}'::jsonb,
  alter column node_config set not null,
  alter column position_x set default 0,
  alter column position_y set default 0,
  alter column created_at set default now(),
  alter column created_at set not null;

alter table public.automation_connections
  alter column automation_id set not null,
  alter column source_node_id set not null,
  alter column target_node_id set not null,
  alter column condition_branch set default 'default',
  alter column condition_branch set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

alter table public.automation_executions
  alter column automation_id set not null,
  alter column status set default 'pending',
  alter column status set not null,
  alter column started_at set default now(),
  alter column started_at set not null,
  alter column execution_data set default '{}'::jsonb,
  alter column execution_data set not null;

-- 2) Status/type guardrails. Add idempotently because Supabase migrations may be replayed in branches.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'automation_executions_status_check'
      and conrelid = 'public.automation_executions'::regclass
  ) then
    alter table public.automation_executions
      add constraint automation_executions_status_check
      check (status in ('pending','running','waiting','completed','failed','cancelled','replied')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'automation_nodes_node_type_check'
      and conrelid = 'public.automation_nodes'::regclass
  ) then
    alter table public.automation_nodes
      add constraint automation_nodes_node_type_check
      check (node_type in ('trigger','action','condition','delay','wait')) not valid;
  end if;
end $$;

alter table public.automation_executions validate constraint automation_executions_status_check;
alter table public.automation_nodes validate constraint automation_nodes_node_type_check;

-- 3) Operational indexes for cron, executor, history and flow traversal.
create index if not exists idx_automations_org_trigger_active
  on public.automations (organization_id, trigger_type, is_active);

create index if not exists idx_automations_org_created_at
  on public.automations (organization_id, created_at desc);

create index if not exists idx_automation_nodes_automation
  on public.automation_nodes (automation_id);

create index if not exists idx_automation_nodes_automation_type
  on public.automation_nodes (automation_id, node_type);

create index if not exists idx_automation_connections_automation
  on public.automation_connections (automation_id);

create index if not exists idx_automation_connections_source
  on public.automation_connections (source_node_id);

create index if not exists idx_automation_connections_target
  on public.automation_connections (target_node_id);

create index if not exists idx_automation_executions_waiting_due
  on public.automation_executions (next_execution_at)
  where status = 'waiting';

create index if not exists idx_automation_executions_org_started
  on public.automation_executions (organization_id, started_at desc);

create index if not exists idx_automation_executions_automation_started
  on public.automation_executions (automation_id, started_at desc);

create index if not exists idx_automation_executions_active_lead
  on public.automation_executions (automation_id, lead_id, status)
  where status in ('running','waiting');

create index if not exists idx_automation_executions_lock_recovery
  on public.automation_executions (status, locked_at)
  where status = 'running';

create index if not exists idx_automation_message_dispatches_org_created
  on public.automation_message_dispatches (organization_id, created_at desc);

-- 4) Make stage-change cancellation function explicit and reproducible.
create or replace function public.cancel_automations_on_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage_id is distinct from old.stage_id then
    update public.automation_executions ae
       set status = 'cancelled',
           completed_at = now(),
           next_execution_at = null,
           error_message = 'Cancelado: lead mudou de estágio'
      from public.automations a
     where a.id = ae.automation_id
       and ae.lead_id = new.id
       and ae.status in ('running', 'waiting')
       and coalesce((a.trigger_config ->> 'cancel_on_stage_change')::boolean, false) = true;
  end if;

  return new;
end;
$$;

-- 5) Remove hardcoded bearer token from database HTTP calls. These functions are verify_jwt=false.
create or replace function public.trigger_visual_automations_on_lead_created()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'event_type', 'lead_created',
    'data', jsonb_build_object(
      'lead_id', new.id,
      'organization_id', new.organization_id,
      'stage_id', new.stage_id
    )
  );

  begin
    perform net.http_post(
      url := 'https://iemalzlfnbouobyjwlwi.supabase.co/functions/v1/automation-trigger',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := v_payload
    );
  exception when others then
    raise warning 'Falha ao chamar automation-trigger: %', sqlerrm;
  end;

  return new;
end;
$$;

create or replace function public.trigger_visual_automations_on_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_payload jsonb;
begin
  if tg_op = 'UPDATE' and old.stage_id is distinct from new.stage_id then
    v_payload := jsonb_build_object(
      'event_type', 'lead_stage_changed',
      'data', jsonb_build_object(
        'lead_id', new.id,
        'old_stage_id', old.stage_id,
        'new_stage_id', new.stage_id,
        'organization_id', new.organization_id
      )
    );

    begin
      perform net.http_post(
        url := 'https://iemalzlfnbouobyjwlwi.supabase.co/functions/v1/automation-trigger',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := v_payload
      );
    exception when others then
      raise warning 'Falha ao chamar automation-trigger: %', sqlerrm;
    end;
  end if;

  return new;
end;
$$;

create or replace function public.trigger_visual_automations_on_tag_added()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_payload jsonb;
  v_lead_record record;
begin
  select id, organization_id
    into v_lead_record
    from public.leads
   where id = new.lead_id;

  if v_lead_record.id is not null then
    v_payload := jsonb_build_object(
      'event_type', 'tag_added',
      'data', jsonb_build_object(
        'lead_id', new.lead_id,
        'tag_id', new.tag_id,
        'organization_id', v_lead_record.organization_id
      )
    );

    begin
      perform net.http_post(
        url := 'https://iemalzlfnbouobyjwlwi.supabase.co/functions/v1/automation-trigger',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := v_payload
      );
    exception when others then
      raise warning 'Falha ao chamar automation-trigger: %', sqlerrm;
    end;
  end if;

  return new;
end;
$$;

-- 6) Reschedule automation delay processor without embedded token.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'automation-delay-processor') then
    perform cron.unschedule('automation-delay-processor');
  end if;

  perform cron.schedule(
    'automation-delay-processor',
    '* * * * *',
    $cron$
    select net.http_post(
      url := 'https://iemalzlfnbouobyjwlwi.supabase.co/functions/v1/automation-delay-processor',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := '{}'::jsonb
    ) as request_id;
    $cron$
  );
end $$;
