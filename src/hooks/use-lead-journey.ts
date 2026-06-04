import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface JourneyEvent {
  id: string;
  event_type: string;
  page_path: string;
  page_title: string | null;
  property_id: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  referrer: string | null;
  device_type: string | null;
  browser: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

export function useLeadJourney(leadId: string | undefined) {
  return useQuery({
    queryKey: ['lead-journey', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      if (!leadId) return [];

      // First get the visitor_session_id from the lead
      const { data: lead } = await supabase
        .from('leads')
        .select('visitor_session_id')
        .eq('id', leadId)
        .maybeSingle();

      const sessionId = (lead as any)?.visitor_session_id;
      if (!sessionId) return [];

      // Fetch all events for this session
      const { data: events, error } = await (supabase as any)
        .from('lead_events')
        .select('id, event_type, page_path, page_title, property_id, created_at, metadata, referrer, device_type, browser, utm_source, utm_medium, utm_campaign')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[LeadJourney] Error fetching events:', error);
        return [];
      }

      return (events || []) as JourneyEvent[];
    },
  });
}
