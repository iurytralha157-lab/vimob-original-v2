-- Add missing tracking columns to lead_meta table
ALTER TABLE lead_meta 
  ADD COLUMN IF NOT EXISTS campaign_name text,
  ADD COLUMN IF NOT EXISTS adset_name text,
  ADD COLUMN IF NOT EXISTS ad_name text,
  ADD COLUMN IF NOT EXISTS platform text;

-- Add comment for documentation
COMMENT ON COLUMN lead_meta.campaign_name IS 'Name of the marketing campaign';
COMMENT ON COLUMN lead_meta.adset_name IS 'Name of the ad set';
COMMENT ON COLUMN lead_meta.ad_name IS 'Name of the specific ad';
COMMENT ON COLUMN lead_meta.platform IS 'Platform source (meta, google, etc)';