-- Keep frontend-readable Meta integration fields available while blocking token reads.

revoke select on table public.meta_integrations from anon, authenticated;

grant select (
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
) on table public.meta_integrations to authenticated;

grant select on table public.meta_integrations_public to authenticated;
revoke all on table public.meta_integrations_public from anon;
