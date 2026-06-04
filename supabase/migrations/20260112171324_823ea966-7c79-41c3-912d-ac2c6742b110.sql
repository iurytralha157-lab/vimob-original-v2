-- Add tracking columns to lead_meta table
ALTER TABLE public.lead_meta
ADD COLUMN IF NOT EXISTS ad_name TEXT,
ADD COLUMN IF NOT EXISTS adset_name TEXT,
ADD COLUMN IF NOT EXISTS campaign_name TEXT,
ADD COLUMN IF NOT EXISTS platform TEXT;

-- Add quick access columns to leads table
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS source_detail TEXT,
ADD COLUMN IF NOT EXISTS campaign_name TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.lead_meta.ad_name IS 'Name of the ad that generated the lead';
COMMENT ON COLUMN public.lead_meta.adset_name IS 'Name of the ad set';
COMMENT ON COLUMN public.lead_meta.campaign_name IS 'Name of the campaign';
COMMENT ON COLUMN public.lead_meta.platform IS 'Platform where lead was captured (facebook/instagram)';
COMMENT ON COLUMN public.leads.source_detail IS 'Detailed source name (e.g., ad name)';
COMMENT ON COLUMN public.leads.campaign_name IS 'Campaign name for quick access';