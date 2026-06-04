-- Make campaign filtering fast and backfill WhatsApp campaign data that was
-- previously stored only on leads.

INSERT INTO public.lead_meta (
  lead_id,
  campaign_id,
  campaign_name,
  adset_id,
  ad_id,
  utm_source,
  utm_medium,
  utm_campaign,
  utm_content,
  utm_term,
  platform,
  source_type,
  raw_payload
)
SELECT
  l.id,
  NULLIF(COALESCE(l.meta_campaign_id, l.utm_campaign), ''),
  NULLIF(COALESCE(l.utm_campaign, l.meta_campaign_id), ''),
  NULLIF(l.meta_adset_id, ''),
  NULLIF(l.meta_ad_id, ''),
  NULLIF(l.utm_source, ''),
  NULLIF(l.utm_medium, ''),
  NULLIF(l.utm_campaign, ''),
  NULLIF(l.utm_content, ''),
  NULLIF(l.utm_term, ''),
  CASE
    WHEN l.source IN ('whatsapp', 'facebook', 'instagram') THEN 'whatsapp_meta'
    ELSE l.source
  END,
  CASE
    WHEN l.source IN ('whatsapp', 'facebook', 'instagram') THEN 'whatsapp'
    ELSE 'lead'
  END,
  jsonb_build_object('source', 'lead_backfill', 'lead_source', l.source)
FROM public.leads l
WHERE (
    NULLIF(l.meta_campaign_id, '') IS NOT NULL
    OR NULLIF(l.utm_campaign, '') IS NOT NULL
    OR NULLIF(l.meta_adset_id, '') IS NOT NULL
    OR NULLIF(l.meta_ad_id, '') IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.lead_meta lm
    WHERE lm.lead_id = l.id
      AND COALESCE(lm.campaign_id, '') = COALESCE(NULLIF(COALESCE(l.meta_campaign_id, l.utm_campaign), ''), '')
      AND COALESCE(lm.adset_id, '') = COALESCE(NULLIF(l.meta_adset_id, ''), '')
      AND COALESCE(lm.ad_id, '') = COALESCE(NULLIF(l.meta_ad_id, ''), '')
  );

CREATE INDEX IF NOT EXISTS idx_lead_meta_lead_id
  ON public.lead_meta (lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_meta_campaign_id
  ON public.lead_meta (campaign_id)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_meta_campaign_name
  ON public.lead_meta (campaign_name)
  WHERE campaign_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_meta_adset_id
  ON public.lead_meta (adset_id)
  WHERE adset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_meta_ad_id
  ON public.lead_meta (ad_id)
  WHERE ad_id IS NOT NULL;
