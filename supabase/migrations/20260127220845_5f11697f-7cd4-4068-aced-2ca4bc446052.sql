-- Add outcome columns to lead_tasks table
ALTER TABLE public.lead_tasks 
ADD COLUMN IF NOT EXISTS outcome TEXT,
ADD COLUMN IF NOT EXISTS outcome_notes TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.lead_tasks.outcome IS 'Result of the contact attempt: answered, not_answered, invalid_number, busy, scheduled, replied, seen_no_reply, not_seen, no_whatsapp, not_replied, bounced';
COMMENT ON COLUMN public.lead_tasks.outcome_notes IS 'Optional notes from the user about the outcome';