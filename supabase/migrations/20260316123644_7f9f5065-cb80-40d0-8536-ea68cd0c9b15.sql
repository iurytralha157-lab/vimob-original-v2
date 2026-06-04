
-- Add ad_account_id to meta_integrations
ALTER TABLE public.meta_integrations ADD COLUMN IF NOT EXISTS ad_account_id text;

-- Create meta_campaign_insights cache table
CREATE TABLE IF NOT EXISTS public.meta_campaign_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_id text,
  ad_name text,
  creative_url text,
  creative_video_url text,
  spend numeric DEFAULT 0,
  impressions integer DEFAULT 0,
  reach integer DEFAULT 0,
  leads_count integer DEFAULT 0,
  cpl numeric DEFAULT 0,
  date_start date,
  date_stop date,
  level text NOT NULL DEFAULT 'campaign',
  fetched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Add unique constraint to avoid duplicates
ALTER TABLE public.meta_campaign_insights 
  ADD CONSTRAINT meta_campaign_insights_unique 
  UNIQUE (organization_id, campaign_id, adset_id, ad_id, date_start, date_stop);

-- Enable RLS
ALTER TABLE public.meta_campaign_insights ENABLE ROW LEVEL SECURITY;

-- RLS: org members can read
CREATE POLICY "Org members can view campaign insights"
  ON public.meta_campaign_insights FOR SELECT TO authenticated
  USING (public.user_belongs_to_organization(organization_id));

-- RLS: org members can insert/update (via edge function with service role, but also allow authenticated)
CREATE POLICY "Org members can manage campaign insights"
  ON public.meta_campaign_insights FOR ALL TO authenticated
  USING (public.user_belongs_to_organization(organization_id))
  WITH CHECK (public.user_belongs_to_organization(organization_id));

-- Index for fast lookups
CREATE INDEX idx_meta_campaign_insights_org ON public.meta_campaign_insights(organization_id);
CREATE INDEX idx_meta_campaign_insights_campaign ON public.meta_campaign_insights(organization_id, campaign_id);
