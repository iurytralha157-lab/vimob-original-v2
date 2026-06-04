-- Add visitor_session_id to leads table to link anonymous browsing sessions
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS visitor_session_id TEXT;

-- Index for efficient lookup
CREATE INDEX IF NOT EXISTS idx_leads_visitor_session_id ON public.leads(visitor_session_id) WHERE visitor_session_id IS NOT NULL;
