
-- Table to store page view events from public sites
CREATE TABLE public.site_analytics_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'pageview',
  page_path TEXT NOT NULL,
  page_title TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  device_type TEXT, -- 'desktop', 'mobile', 'tablet'
  browser TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  duration_seconds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_site_analytics_org_created ON public.site_analytics_events(organization_id, created_at DESC);
CREATE INDEX idx_site_analytics_session ON public.site_analytics_events(session_id);
CREATE INDEX idx_site_analytics_event_type ON public.site_analytics_events(event_type);

-- Enable RLS
ALTER TABLE public.site_analytics_events ENABLE ROW LEVEL SECURITY;

-- Policy: users can read their own org's analytics
CREATE POLICY "Users can view own org analytics"
  ON public.site_analytics_events
  FOR SELECT
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.users WHERE id = auth.uid()
  ));

-- Policy: allow anonymous inserts (tracking from public site)
CREATE POLICY "Allow anonymous inserts for tracking"
  ON public.site_analytics_events
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- RPC to get analytics summary
CREATE OR REPLACE FUNCTION public.get_site_analytics_summary(
  p_organization_id UUID,
  p_date_from TIMESTAMP WITH TIME ZONE DEFAULT (now() - interval '7 days'),
  p_date_to TIMESTAMP WITH TIME ZONE DEFAULT now()
)
RETURNS JSON
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result JSON;
  v_total_views BIGINT;
  v_total_pages BIGINT;
  v_unique_pages BIGINT;
  v_unique_sessions BIGINT;
  v_avg_duration NUMERIC;
  v_desktop_pct NUMERIC;
  v_mobile_pct NUMERIC;
  v_tablet_pct NUMERIC;
  v_direct_pct NUMERIC;
  v_search_pct NUMERIC;
  v_social_pct NUMERIC;
  v_campaign_pct NUMERIC;
  v_conversions BIGINT;
  -- Previous period
  v_prev_from TIMESTAMP WITH TIME ZONE;
  v_prev_to TIMESTAMP WITH TIME ZONE;
  v_prev_views BIGINT;
  v_prev_pages BIGINT;
  v_prev_unique_pages BIGINT;
  v_prev_avg_duration NUMERIC;
  v_prev_desktop_pct NUMERIC;
  v_prev_mobile_pct NUMERIC;
  v_prev_conversions BIGINT;
BEGIN
  -- Current period
  SELECT COUNT(*) INTO v_total_views
  FROM site_analytics_events
  WHERE organization_id = p_organization_id
    AND created_at >= p_date_from AND created_at <= p_date_to;

  SELECT COUNT(*) INTO v_total_pages
  FROM site_analytics_events
  WHERE organization_id = p_organization_id
    AND event_type = 'pageview'
    AND created_at >= p_date_from AND created_at <= p_date_to;

  SELECT COUNT(DISTINCT page_path) INTO v_unique_pages
  FROM site_analytics_events
  WHERE organization_id = p_organization_id
    AND event_type = 'pageview'
    AND created_at >= p_date_from AND created_at <= p_date_to;

  SELECT COUNT(DISTINCT session_id) INTO v_unique_sessions
  FROM site_analytics_events
  WHERE organization_id = p_organization_id
    AND created_at >= p_date_from AND created_at <= p_date_to;

  SELECT COALESCE(AVG(duration_seconds) FILTER (WHERE duration_seconds > 0), 0) INTO v_avg_duration
  FROM site_analytics_events
  WHERE organization_id = p_organization_id
    AND created_at >= p_date_from AND created_at <= p_date_to;

  -- Device breakdown
  SELECT 
    COALESCE(ROUND(COUNT(*) FILTER (WHERE device_type = 'desktop') * 100.0 / NULLIF(COUNT(*), 0)), 0),
    COALESCE(ROUND(COUNT(*) FILTER (WHERE device_type = 'mobile') * 100.0 / NULLIF(COUNT(*), 0)), 0),
    COALESCE(ROUND(COUNT(*) FILTER (WHERE device_type = 'tablet') * 100.0 / NULLIF(COUNT(*), 0)), 0)
  INTO v_desktop_pct, v_mobile_pct, v_tablet_pct
  FROM site_analytics_events
  WHERE organization_id = p_organization_id
    AND created_at >= p_date_from AND created_at <= p_date_to;

  -- Source breakdown
  SELECT 
    COALESCE(ROUND(COUNT(*) FILTER (WHERE referrer IS NULL OR referrer = '') * 100.0 / NULLIF(COUNT(*), 0)), 0),
    COALESCE(ROUND(COUNT(*) FILTER (WHERE referrer ILIKE '%google%' OR referrer ILIKE '%bing%' OR referrer ILIKE '%yahoo%') * 100.0 / NULLIF(COUNT(*), 0)), 0),
    COALESCE(ROUND(COUNT(*) FILTER (WHERE referrer ILIKE '%facebook%' OR referrer ILIKE '%instagram%' OR referrer ILIKE '%twitter%' OR referrer ILIKE '%linkedin%' OR referrer ILIKE '%tiktok%') * 100.0 / NULLIF(COUNT(*), 0)), 0),
    COALESCE(ROUND(COUNT(*) FILTER (WHERE utm_campaign IS NOT NULL AND utm_campaign != '') * 100.0 / NULLIF(COUNT(*), 0)), 0)
  INTO v_direct_pct, v_search_pct, v_social_pct, v_campaign_pct
  FROM site_analytics_events
  WHERE organization_id = p_organization_id
    AND event_type = 'pageview'
    AND created_at >= p_date_from AND created_at <= p_date_to;

  -- Conversions (contact form submissions)
  SELECT COUNT(*) INTO v_conversions
  FROM site_analytics_events
  WHERE organization_id = p_organization_id
    AND event_type = 'conversion'
    AND created_at >= p_date_from AND created_at <= p_date_to;

  -- Previous period (same duration, shifted back)
  v_prev_from := p_date_from - (p_date_to - p_date_from);
  v_prev_to := p_date_from;

  SELECT COUNT(*) INTO v_prev_views
  FROM site_analytics_events
  WHERE organization_id = p_organization_id
    AND created_at >= v_prev_from AND created_at <= v_prev_to;

  SELECT COUNT(*) INTO v_prev_pages
  FROM site_analytics_events
  WHERE organization_id = p_organization_id
    AND event_type = 'pageview'
    AND created_at >= v_prev_from AND created_at <= v_prev_to;

  SELECT COUNT(DISTINCT page_path) INTO v_prev_unique_pages
  FROM site_analytics_events
  WHERE organization_id = p_organization_id
    AND event_type = 'pageview'
    AND created_at >= v_prev_from AND created_at <= v_prev_to;

  SELECT COALESCE(AVG(duration_seconds) FILTER (WHERE duration_seconds > 0), 0) INTO v_prev_avg_duration
  FROM site_analytics_events
  WHERE organization_id = p_organization_id
    AND created_at >= v_prev_from AND created_at <= v_prev_to;

  SELECT 
    COALESCE(ROUND(COUNT(*) FILTER (WHERE device_type = 'desktop') * 100.0 / NULLIF(COUNT(*), 0)), 0),
    COALESCE(ROUND(COUNT(*) FILTER (WHERE device_type = 'mobile') * 100.0 / NULLIF(COUNT(*), 0)), 0)
  INTO v_prev_desktop_pct, v_prev_mobile_pct
  FROM site_analytics_events
  WHERE organization_id = p_organization_id
    AND created_at >= v_prev_from AND created_at <= v_prev_to;

  SELECT COUNT(*) INTO v_prev_conversions
  FROM site_analytics_events
  WHERE organization_id = p_organization_id
    AND event_type = 'conversion'
    AND created_at >= v_prev_from AND created_at <= v_prev_to;

  v_result := json_build_object(
    'totalViews', v_total_views,
    'totalPages', v_total_pages,
    'uniquePages', v_unique_pages,
    'uniqueSessions', v_unique_sessions,
    'avgDuration', ROUND(v_avg_duration::numeric, 2),
    'desktopPct', v_desktop_pct,
    'mobilePct', v_mobile_pct,
    'tabletPct', v_tablet_pct,
    'directPct', v_direct_pct,
    'searchPct', v_search_pct,
    'socialPct', v_social_pct,
    'campaignPct', v_campaign_pct,
    'conversions', v_conversions,
    'prevViews', v_prev_views,
    'prevPages', v_prev_pages,
    'prevUniquePages', v_prev_unique_pages,
    'prevAvgDuration', ROUND(v_prev_avg_duration::numeric, 2),
    'prevDesktopPct', v_prev_desktop_pct,
    'prevMobilePct', v_prev_mobile_pct,
    'prevConversions', v_prev_conversions
  );

  RETURN v_result;
END;
$$;
