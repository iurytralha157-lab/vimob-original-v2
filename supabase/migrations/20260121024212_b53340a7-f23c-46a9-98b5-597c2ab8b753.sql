-- Add installment and recurring support to financial_entries
ALTER TABLE public.financial_entries
ADD COLUMN IF NOT EXISTS installment_number integer,
ADD COLUMN IF NOT EXISTS total_installments integer,
ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS recurring_type text CHECK (recurring_type IN ('monthly', 'weekly', 'yearly')),
ADD COLUMN IF NOT EXISTS parent_entry_id uuid REFERENCES public.financial_entries(id);

-- Add index for parent lookups
CREATE INDEX IF NOT EXISTS idx_financial_entries_parent ON public.financial_entries(parent_entry_id);

-- Add comment for documentation
COMMENT ON COLUMN public.financial_entries.is_recurring IS 'When true, this entry repeats according to recurring_type';
COMMENT ON COLUMN public.financial_entries.recurring_type IS 'Frequency: monthly, weekly, or yearly';
COMMENT ON COLUMN public.financial_entries.parent_entry_id IS 'Links installments/recurrences to original entry';