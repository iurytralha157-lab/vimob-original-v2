ALTER TABLE public.meta_integrations
  ADD COLUMN IF NOT EXISTS selected_ad_accounts jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS instagram_business_account_id text,
  ADD COLUMN IF NOT EXISTS instagram_username text,
  ADD COLUMN IF NOT EXISTS integration_type text NOT NULL DEFAULT 'facebook';

CREATE INDEX IF NOT EXISTS idx_meta_integrations_ig_account
  ON public.meta_integrations (instagram_business_account_id)
  WHERE instagram_business_account_id IS NOT NULL;
