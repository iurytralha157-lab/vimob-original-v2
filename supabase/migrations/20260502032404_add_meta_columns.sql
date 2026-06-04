
-- Add selected_ad_accounts to meta_integrations
ALTER TABLE meta_integrations ADD COLUMN IF NOT EXISTS selected_ad_accounts text[] DEFAULT '{}';

-- Add objective to meta_campaign_insights
ALTER TABLE meta_campaign_insights ADD COLUMN IF NOT EXISTS objective text;

