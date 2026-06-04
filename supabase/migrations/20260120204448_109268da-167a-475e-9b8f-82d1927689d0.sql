-- Add deal_status and VGV fields to leads table
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS deal_status TEXT DEFAULT 'open' CHECK (deal_status IN ('open', 'won', 'lost'));

ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS valor_interesse NUMERIC DEFAULT 0;

ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS won_at TIMESTAMPTZ;

ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ;

ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS lost_reason TEXT;

-- Add commission_percentage to properties table
ALTER TABLE public.properties 
ADD COLUMN IF NOT EXISTS commission_percentage NUMERIC DEFAULT 0;

-- Create index for deal_status queries
CREATE INDEX IF NOT EXISTS idx_leads_deal_status ON public.leads(deal_status);

-- Create index for VGV queries (organization + deal_status)
CREATE INDEX IF NOT EXISTS idx_leads_vgv ON public.leads(organization_id, deal_status, valor_interesse);

-- Add trigger to update won_at/lost_at automatically
CREATE OR REPLACE FUNCTION public.handle_deal_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deal_status = 'won' AND (OLD.deal_status IS NULL OR OLD.deal_status != 'won') THEN
    NEW.won_at = NOW();
  END IF;
  
  IF NEW.deal_status = 'lost' AND (OLD.deal_status IS NULL OR OLD.deal_status != 'lost') THEN
    NEW.lost_at = NOW();
  END IF;
  
  -- Clear timestamps if status changes back to open
  IF NEW.deal_status = 'open' THEN
    NEW.won_at = NULL;
    NEW.lost_at = NULL;
    NEW.lost_reason = NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for deal status changes
DROP TRIGGER IF EXISTS trigger_deal_status_change ON public.leads;
CREATE TRIGGER trigger_deal_status_change
BEFORE UPDATE ON public.leads
FOR EACH ROW
WHEN (OLD.deal_status IS DISTINCT FROM NEW.deal_status)
EXECUTE FUNCTION public.handle_deal_status_change();