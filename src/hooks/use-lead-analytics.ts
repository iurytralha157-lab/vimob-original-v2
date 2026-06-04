import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface LeadJourney {
  session_id: string;
  path_sequence: string[];
  event_sequence: string[];
  first_event: string;
  last_event: string;
  total_events: number;
  converted: boolean;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  city: string | null;
  region: string | null;
}

export interface FunnelStep {
  event_type: string;
  total: number;
}

export interface TopPage {
  page_path: string;
  views: number;
}

export interface DailyView {
  date: string;
  views: number;
}

export interface DeviceBreakdown {
  device_type: string;
  total: number;
}

export interface LocationData {
  city: string;
  region: string | null;
  lat: number;
  lng: number;
  sessions: number;
}

export interface LeadAnalyticsData {
  journeys: LeadJourney[];
  funnel: FunnelStep[];
  top_pages: TopPage[];
  daily_views: DailyView[];
  total_sessions: number;
  total_conversions: number;
  device_breakdown: DeviceBreakdown[];
  locations: LocationData[];
}

export interface SiteAnalyticsSummary {
  totalViews: number;
  totalPages: number;
  uniquePages: number;
  uniqueSessions: number;
  avgDuration: number;
  desktopPct: number;
  mobilePct: number;
  tabletPct: number;
  directPct: number;
  searchPct: number;
  socialPct: number;
  campaignPct: number;
  conversions: number;
  prevViews: number;
  prevPages: number;
  prevUniquePages: number;
  prevAvgDuration: number;
  prevDesktopPct: number;
  prevMobilePct: number;
  prevConversions: number;
}

export interface SiteAnalyticsDetailed {
  topProperties: { property_id: string; title: string; code: string; views: number; favorites: number }[];
  topPages: { page_path: string; views: number }[];
  dailyViews: { date: string; views: number }[];
  conversionRate: number;
  totalSessions: number;
  totalConversions: number;
  siteLeads: number;
}

type AnalyticsEvent = {
  session_id: string;
  event_type: string;
  page_path: string;
  page_title: string | null;
  referrer: string | null;
  utm_campaign: string | null;
  device_type: string | null;
  browser: string | null;
  created_at: string;
  property_id: string | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown> | null;
};

const CONVERSION_EVENT_TYPES = new Set(['form_submit', 'whatsapp_click', 'cta_click', 'conversion']);
const SEARCH_REFERRERS = ['google', 'bing', 'yahoo'];
const SOCIAL_REFERRERS = ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok'];

function emptyLeadAnalyticsData(): LeadAnalyticsData {
  return {
    journeys: [],
    funnel: [],
    top_pages: [],
    daily_views: [],
    total_sessions: 0,
    total_conversions: 0,
    device_breakdown: [],
    locations: [],
  };
}

function emptySiteAnalyticsSummary(): SiteAnalyticsSummary {
  return {
    totalViews: 0,
    totalPages: 0,
    uniquePages: 0,
    uniqueSessions: 0,
    avgDuration: 0,
    desktopPct: 0,
    mobilePct: 0,
    tabletPct: 0,
    directPct: 0,
    searchPct: 0,
    socialPct: 0,
    campaignPct: 0,
    conversions: 0,
    prevViews: 0,
    prevPages: 0,
    prevUniquePages: 0,
    prevAvgDuration: 0,
    prevDesktopPct: 0,
    prevMobilePct: 0,
    prevConversions: 0,
  };
}

function emptySiteAnalyticsDetailed(): SiteAnalyticsDetailed {
  return {
    topProperties: [],
    topPages: [],
    dailyViews: [],
    conversionRate: 0,
    totalSessions: 0,
    totalConversions: 0,
    siteLeads: 0,
  };
}

function toIsoRange(dateFrom?: Date, dateTo?: Date) {
  return {
    from: (dateFrom || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).toISOString(),
    to: (dateTo || new Date()).toISOString(),
  };
}

function getPreviousPeriod(dateFrom: Date, dateTo: Date) {
  const duration = dateTo.getTime() - dateFrom.getTime();
  return {
    from: new Date(dateFrom.getTime() - duration),
    to: new Date(dateFrom.getTime()),
  };
}

function roundPercentage(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function uniqueCount(values: string[]) {
  return new Set(values.filter(Boolean)).size;
}

function getPageViews(events: AnalyticsEvent[]) {
  return events.filter(event => event.event_type === 'pageview');
}

function getConversions(events: AnalyticsEvent[]) {
  return events.filter(event => CONVERSION_EVENT_TYPES.has(event.event_type));
}

function fillDailyRange(sparse: { date: string; views: number }[], dateFrom?: Date, dateTo?: Date): { date: string; views: number }[] {
  const from = dateFrom || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const to = dateTo || new Date();
  const map = new Map(sparse.map(d => [d.date, d.views]));
  const result: { date: string; views: number }[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    result.push({ date: key, views: map.get(key) || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function groupCounts(items: string[]) {
  const counts = new Map<string, number>();
  items.forEach(item => counts.set(item, (counts.get(item) || 0) + 1));
  return counts;
}

async function fetchAnalyticsEvents(organizationId: string, dateFrom?: Date, dateTo?: Date): Promise<AnalyticsEvent[]> {
  const range = toIsoRange(dateFrom, dateTo);

  const [leadEventsResult, legacyEventsResult] = await Promise.all([
    supabase
      .from('lead_events')
      .select('session_id, event_type, page_path, page_title, referrer, utm_campaign, device_type, browser, created_at, property_id, metadata')
      .eq('organization_id', organizationId)
      .gte('created_at', range.from)
      .lte('created_at', range.to)
      .order('created_at', { ascending: true })
      .range(0, 4999),
    supabase
      .from('site_analytics_events')
      .select('session_id, event_type, page_path, page_title, referrer, utm_campaign, device_type, created_at, duration_seconds')
      .eq('organization_id', organizationId)
      .gte('created_at', range.from)
      .lte('created_at', range.to)
      .order('created_at', { ascending: true })
      .range(0, 4999),
  ]);

  if (leadEventsResult.error) {
    console.error('Lead events query error:', leadEventsResult.error);
  }

  if (legacyEventsResult.error) {
    console.error('Legacy analytics query error:', legacyEventsResult.error);
  }

  const leadEvents: AnalyticsEvent[] = (leadEventsResult.data || []).map(event => ({
    session_id: event.session_id,
    event_type: event.event_type,
    page_path: event.page_path,
    page_title: event.page_title,
    referrer: event.referrer,
    utm_campaign: event.utm_campaign,
    device_type: event.device_type,
    browser: (event as any).browser || null,
    created_at: event.created_at,
    property_id: event.property_id,
    duration_seconds: null,
    metadata: (event as any).metadata || null,
  }));

  const legacyEvents: AnalyticsEvent[] = (legacyEventsResult.data || []).map(event => ({
    session_id: event.session_id,
    event_type: event.event_type,
    page_path: event.page_path,
    page_title: event.page_title,
    referrer: event.referrer,
    utm_campaign: event.utm_campaign,
    device_type: event.device_type,
    browser: null,
    created_at: event.created_at,
    property_id: null,
    duration_seconds: event.duration_seconds,
    metadata: null,
  }));

  return [...legacyEvents, ...leadEvents].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function buildSummary(events: AnalyticsEvent[]): Omit<SiteAnalyticsSummary, 'prevViews' | 'prevPages' | 'prevUniquePages' | 'prevAvgDuration' | 'prevDesktopPct' | 'prevMobilePct' | 'prevConversions'> {
  const pageViews = getPageViews(events);
  const conversions = getConversions(events);
  const durations = events.map(event => event.duration_seconds).filter((value): value is number => typeof value === 'number' && value > 0);
  const deviceCounts = groupCounts(events.map(event => event.device_type || 'unknown'));
  const totalEvents = events.length;

  const directCount = pageViews.filter(event => !event.referrer).length;
  const searchCount = pageViews.filter(event => {
    const referrer = event.referrer?.toLowerCase() || '';
    return SEARCH_REFERRERS.some(term => referrer.includes(term));
  }).length;
  const socialCount = pageViews.filter(event => {
    const referrer = event.referrer?.toLowerCase() || '';
    return SOCIAL_REFERRERS.some(term => referrer.includes(term));
  }).length;
  const campaignCount = pageViews.filter(event => !!event.utm_campaign).length;

  return {
    totalViews: totalEvents,
    totalPages: pageViews.length,
    uniquePages: uniqueCount(pageViews.map(event => event.page_path)),
    uniqueSessions: uniqueCount(events.map(event => event.session_id)),
    avgDuration: durations.length ? Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(2)) : 0,
    desktopPct: roundPercentage(deviceCounts.get('desktop') || 0, totalEvents),
    mobilePct: roundPercentage(deviceCounts.get('mobile') || 0, totalEvents),
    tabletPct: roundPercentage(deviceCounts.get('tablet') || 0, totalEvents),
    directPct: roundPercentage(directCount, pageViews.length),
    searchPct: roundPercentage(searchCount, pageViews.length),
    socialPct: roundPercentage(socialCount, pageViews.length),
    campaignPct: roundPercentage(campaignCount, pageViews.length),
    conversions: uniqueCount(conversions.map(event => event.session_id)),
  };
}

async function buildDetailedAnalytics(events: AnalyticsEvent[], dateFrom?: Date, dateTo?: Date): Promise<SiteAnalyticsDetailed> {
  const pageViews = getPageViews(events);
  const conversions = getConversions(events);
  const totalSessions = uniqueCount(events.map(event => event.session_id));
  const totalConversions = uniqueCount(conversions.map(event => event.session_id));
  const siteLeads = events.filter(event => event.event_type === 'form_submit').length;

  const sparseDaily = Array.from(groupCounts(pageViews.map(event => event.created_at.slice(0, 10))).entries())
    .map(([date, views]) => ({ date, views }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const dailyViews = fillDailyRange(sparseDaily, dateFrom, dateTo);

  const topPages = Array.from(groupCounts(pageViews.map(event => event.page_path)).entries())
    .map(([page_path, views]) => ({ page_path, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  const propertyStats = new Map<string, { views: number; favorites: number }>();
  events.forEach(event => {
    if (!event.property_id) return;
    const current = propertyStats.get(event.property_id) || { views: 0, favorites: 0 };
    if (event.event_type === 'pageview') current.views += 1;
    if (event.event_type === 'favorite') current.favorites += 1;
    propertyStats.set(event.property_id, current);
  });

  const topPropertyIds = Array.from(propertyStats.entries())
    .sort((a, b) => (b[1].views + b[1].favorites) - (a[1].views + a[1].favorites))
    .slice(0, 10)
    .map(([propertyId]) => propertyId);

  const propertiesResult = topPropertyIds.length
    ? await supabase.from('properties').select('id, title, code').in('id', topPropertyIds)
    : { data: [], error: null };

  if (propertiesResult.error) {
    console.error('Properties analytics query error:', propertiesResult.error);
  }

  const propertiesMap = new Map((propertiesResult.data || []).map(property => [property.id, property]));

  const topProperties = topPropertyIds
    .map(propertyId => {
      const property = propertiesMap.get(propertyId);
      const stats = propertyStats.get(propertyId);
      if (!property || !stats) return null;
      return {
        property_id: propertyId,
        title: property.title,
        code: property.code,
        views: stats.views,
        favorites: stats.favorites,
      };
    })
    .filter((property): property is NonNullable<typeof property> => !!property);

  return {
    topProperties,
    topPages,
    dailyViews,
    conversionRate: totalSessions > 0 ? Number(((totalConversions / totalSessions) * 100).toFixed(1)) : 0,
    totalSessions,
    totalConversions,
    siteLeads,
  };
}

function buildLeadAnalytics(events: AnalyticsEvent[], dateFrom?: Date, dateTo?: Date): LeadAnalyticsData {
  const pageViews = getPageViews(events);
  const conversions = getConversions(events);

  const sessionMap = new Map<string, AnalyticsEvent[]>();
  events.forEach(event => {
    const current = sessionMap.get(event.session_id) || [];
    current.push(event);
    sessionMap.set(event.session_id, current);
  });

  const journeys = Array.from(sessionMap.entries())
    .map(([session_id, sessionEvents]) => {
      const orderedEvents = [...sessionEvents].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const firstEvent = orderedEvents[0];
      // Extract enriched data from metadata of first event
      const meta = firstEvent?.metadata as Record<string, unknown> | null;
      return {
        session_id,
        path_sequence: orderedEvents.map(event => event.page_path),
        event_sequence: orderedEvents.map(event => event.event_type),
        first_event: orderedEvents[0]?.created_at || '',
        last_event: orderedEvents[orderedEvents.length - 1]?.created_at || '',
        total_events: orderedEvents.length,
        converted: orderedEvents.some(event => CONVERSION_EVENT_TYPES.has(event.event_type)),
        device_type: firstEvent?.device_type || null,
        browser: firstEvent?.browser || null,
        os: (meta?.os as string) || null,
        city: (meta?.city as string) || null,
        region: (meta?.region as string) || null,
      };
    })
    .sort((a, b) => b.last_event.localeCompare(a.last_event))
    .slice(0, 50);

  const funnel = Array.from(groupCounts(events.map(event => event.event_type)).entries())
    .map(([event_type, total]) => ({ event_type, total }))
    .sort((a, b) => b.total - a.total);

  const top_pages = Array.from(groupCounts(pageViews.map(event => event.page_path)).entries())
    .map(([page_path, views]) => ({ page_path, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  const sparseDaily = Array.from(groupCounts(pageViews.map(event => event.created_at.slice(0, 10))).entries())
    .map(([date, views]) => ({ date, views }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const daily_views = fillDailyRange(sparseDaily, dateFrom, dateTo);

  const device_breakdown = Array.from(groupCounts(events.map(event => event.device_type || 'unknown')).entries())
    .map(([device_type, total]) => ({ device_type, total }))
    .sort((a, b) => b.total - a.total);

  // Build location data from metadata
  const locationMap = new Map<string, LocationData>();
  events.forEach(event => {
    const meta = event.metadata as Record<string, unknown> | null;
    if (!meta?.city || !meta?.lat || !meta?.lng) return;
    const key = `${meta.city}`;
    const existing = locationMap.get(key);
    if (existing) {
      existing.sessions += 1;
    } else {
      locationMap.set(key, {
        city: meta.city as string,
        region: (meta.region as string) || null,
        lat: meta.lat as number,
        lng: meta.lng as number,
        sessions: 1,
      });
    }
  });
  const locations = Array.from(locationMap.values()).sort((a, b) => b.sessions - a.sessions);

  return {
    journeys,
    funnel,
    top_pages,
    daily_views,
    total_sessions: uniqueCount(events.map(event => event.session_id)),
    total_conversions: uniqueCount(conversions.map(event => event.session_id)),
    device_breakdown,
    locations,
  };
}

export function useLeadAnalytics(dateFrom?: Date, dateTo?: Date) {
  const { organization } = useAuth();

  return useQuery({
    queryKey: ['lead-analytics', organization?.id, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async (): Promise<LeadAnalyticsData> => {
      if (!organization?.id) return emptyLeadAnalyticsData();
      const events = await fetchAnalyticsEvents(organization.id, dateFrom, dateTo);
      return buildLeadAnalytics(events, dateFrom, dateTo);
    },
    enabled: !!organization?.id,
  });
}

export function useSiteAnalytics(dateFrom?: Date, dateTo?: Date) {
  const { organization } = useAuth();

  return useQuery({
    queryKey: ['site-analytics', organization?.id, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async (): Promise<SiteAnalyticsSummary> => {
      if (!organization?.id) return emptySiteAnalyticsSummary();

      const currentFrom = dateFrom || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const currentTo = dateTo || new Date();
      const previousPeriod = getPreviousPeriod(currentFrom, currentTo);

      const [currentEvents, previousEvents] = await Promise.all([
        fetchAnalyticsEvents(organization.id, currentFrom, currentTo),
        fetchAnalyticsEvents(organization.id, previousPeriod.from, previousPeriod.to),
      ]);

      const current = buildSummary(currentEvents);
      const previous = buildSummary(previousEvents);

      return {
        ...current,
        prevViews: previous.totalViews,
        prevPages: previous.totalPages,
        prevUniquePages: previous.uniquePages,
        prevAvgDuration: previous.avgDuration,
        prevDesktopPct: previous.desktopPct,
        prevMobilePct: previous.mobilePct,
        prevConversions: previous.conversions,
      };
    },
    enabled: !!organization?.id,
  });
}

export function useSiteAnalyticsDetailed(dateFrom?: Date, dateTo?: Date) {
  const { organization } = useAuth();

  return useQuery({
    queryKey: ['site-analytics-detailed', organization?.id, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async (): Promise<SiteAnalyticsDetailed> => {
      if (!organization?.id) return emptySiteAnalyticsDetailed();
      const events = await fetchAnalyticsEvents(organization.id, dateFrom, dateTo);
      return buildDetailedAnalytics(events, dateFrom, dateTo);
    },
    enabled: !!organization?.id,
  });
}
