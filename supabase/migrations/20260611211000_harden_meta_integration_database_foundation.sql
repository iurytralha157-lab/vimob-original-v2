-- Harden Meta integration tables without removing existing operational behavior.

alter table public.meta_integrations
  add column if not exists selected_ad_accounts jsonb not null default '[]'::jsonb,
  add column if not exists instagram_business_account_id text,
  add column if not exists instagram_username text,
  add column if not exists integration_type text not null default 'facebook';

create index if not exists idx_meta_integrations_ig_account
  on public.meta_integrations (instagram_business_account_id)
  where instagram_business_account_id is not null;

drop policy if exists "Org members can manage campaign insights" on public.meta_campaign_insights;

revoke all on table public.meta_campaign_insights from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.meta_campaign_insights
  from authenticated;

grant select on table public.meta_campaign_insights to authenticated;

drop policy if exists "Org members can view campaign insights" on public.meta_campaign_insights;
create policy "Org members can view campaign insights"
  on public.meta_campaign_insights
  for select
  to authenticated
  using (public.user_belongs_to_organization(organization_id));

revoke all on table public.meta_conversations from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.meta_conversations
  from authenticated;

revoke all on table public.meta_messages from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.meta_messages
  from authenticated;

grant select on table public.meta_conversations to authenticated;
grant select on table public.meta_messages to authenticated;

create unique index if not exists uq_meta_conversations_page_external
  on public.meta_conversations (page_id, external_id)
  where page_id is not null and external_id is not null;

create unique index if not exists uq_meta_messages_conversation_external
  on public.meta_messages (conversation_id, external_id)
  where conversation_id is not null and external_id is not null;

create or replace view public.meta_integrations_public
with (security_invoker = true)
as
select
  id,
  organization_id,
  page_id,
  page_name,
  page_picture_url,
  facebook_user_id,
  facebook_user_name,
  is_connected,
  integration_type,
  instagram_business_account_id,
  instagram_username,
  ad_account_id,
  selected_ad_accounts,
  pipeline_id,
  stage_id,
  default_status,
  leads_received,
  last_lead_at,
  last_sync_at,
  last_error,
  health_status,
  token_status,
  token_expires_at,
  last_validated_at,
  webhook_subscribed_at,
  created_at,
  updated_at
from public.meta_integrations;

revoke all on table public.meta_integrations from anon;
revoke all on table public.meta_integrations_public from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.meta_integrations_public
  from authenticated;

grant select on table public.meta_integrations_public to authenticated;

comment on view public.meta_integrations_public is
  'Tokenless public-facing projection of Meta integrations. Use this from frontend instead of public.meta_integrations.';
