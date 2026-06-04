-- Add commission_percentage column to leads table
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS commission_percentage numeric DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.leads.commission_percentage IS 'Commission percentage for this specific deal (overrides property commission)';