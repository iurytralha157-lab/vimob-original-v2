alter table public.onboarding_requests
  add column if not exists privacy_policy_accepted boolean not null default false,
  add column if not exists terms_accepted boolean not null default false,
  add column if not exists privacy_policy_version text,
  add column if not exists terms_version text,
  add column if not exists legal_accepted_at timestamptz,
  add column if not exists onboarding_completed_at timestamptz;

do $$
declare
  v_enterprise_id uuid;
  v_master_id uuid;
begin
  select id into v_enterprise_id
  from public.admin_subscription_plans
  where lower(name) = 'enterprise'
  order by created_at nulls last
  limit 1;

  if v_enterprise_id is null then
    insert into public.admin_subscription_plans (
      name, description, price, billing_cycle, trial_enabled, trial_days,
      max_users, max_whatsapp_sessions, modules, is_active
    )
    values (
      'Enterprise',
      'Plano intermediario com 7 dias de teste para validar o board antes da primeira cobranca.',
      197,
      'monthly',
      true,
      7,
      15,
      1,
      array['crm', 'dashboard', 'leads', 'contacts', 'pipelines', 'whatsapp', 'properties', 'agenda', 'reports', 'site'],
      true
    );
  else
    update public.admin_subscription_plans
    set description = 'Plano intermediario com 7 dias de teste para validar o board antes da primeira cobranca.',
        price = 197,
        billing_cycle = 'monthly',
        trial_enabled = true,
        trial_days = 7,
        max_users = greatest(coalesce(max_users, 0), 15),
        max_whatsapp_sessions = coalesce(max_whatsapp_sessions, 1),
        modules = array['crm', 'dashboard', 'leads', 'contacts', 'pipelines', 'whatsapp', 'properties', 'agenda', 'reports', 'site'],
        is_active = true,
        updated_at = now()
    where id = v_enterprise_id;
  end if;

  select id into v_master_id
  from public.admin_subscription_plans
  where lower(name) = 'master'
  order by created_at nulls last
  limit 1;

  if v_master_id is null then
    insert into public.admin_subscription_plans (
      name, description, price, billing_cycle, trial_enabled, trial_days,
      max_users, max_whatsapp_sessions, modules, is_active
    )
    values (
      'Master',
      'Plano completo com liberacao apos pagamento por incluir recursos fora do teste gratuito.',
      497,
      'monthly',
      false,
      0,
      50,
      5,
      array['crm', 'dashboard', 'leads', 'contacts', 'pipelines', 'automations', 'whatsapp', 'financial', 'properties', 'agenda', 'reports', 'site', 'ai_agent', 'campaigns'],
      true
    );
  else
    update public.admin_subscription_plans
    set description = 'Plano completo com liberacao apos pagamento por incluir recursos fora do teste gratuito.',
        price = 497,
        billing_cycle = 'monthly',
        trial_enabled = false,
        trial_days = 0,
        max_users = greatest(coalesce(max_users, 0), 50),
        max_whatsapp_sessions = greatest(coalesce(max_whatsapp_sessions, 0), 5),
        modules = array['crm', 'dashboard', 'leads', 'contacts', 'pipelines', 'automations', 'whatsapp', 'financial', 'properties', 'agenda', 'reports', 'site', 'ai_agent', 'campaigns'],
        is_active = true,
        updated_at = now()
    where id = v_master_id;
  end if;
end $$;
