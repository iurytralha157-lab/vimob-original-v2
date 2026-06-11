-- Optimize dashboard filters that scope data by organization, assigned user and period.
-- These are read-path indexes only; they do not change RLS or business behavior.

CREATE INDEX IF NOT EXISTS idx_leads_dashboard_user_created
ON public.leads (organization_id, assigned_user_id, created_at DESC)
WHERE assigned_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_dashboard_user_won
ON public.leads (organization_id, assigned_user_id, won_at DESC)
WHERE assigned_user_id IS NOT NULL
  AND won_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_events_dashboard_user_visits
ON public.schedule_events (organization_id, user_id, start_time DESC)
WHERE event_type = 'visit'
  AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_properties_dashboard_corretor_created
ON public.properties (organization_id, corretor_id, created_at DESC)
WHERE corretor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_properties_dashboard_creator_created
ON public.properties (organization_id, cadastrado_por, created_at DESC)
WHERE cadastrado_por IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_events_dashboard_property_created
ON public.lead_events (organization_id, property_id, created_at DESC, session_id)
WHERE property_id IS NOT NULL;
