alter table public.admin_subscription_plans
  add column if not exists trial_enabled boolean default false;

update public.admin_subscription_plans
set trial_enabled = coalesce(trial_days, 0) > 0
where trial_enabled is distinct from (coalesce(trial_days, 0) > 0);
