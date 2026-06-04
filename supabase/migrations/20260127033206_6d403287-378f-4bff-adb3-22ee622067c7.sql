-- Add pool/bolsão columns to pipelines table
ALTER TABLE public.pipelines 
ADD COLUMN IF NOT EXISTS pool_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS pool_timeout_minutes INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS pool_max_redistributions INTEGER DEFAULT 3;

-- Add comment for documentation
COMMENT ON COLUMN public.pipelines.pool_enabled IS 'Enable automatic lead redistribution (bolsão)';
COMMENT ON COLUMN public.pipelines.pool_timeout_minutes IS 'Minutes before lead is redistributed if no contact';
COMMENT ON COLUMN public.pipelines.pool_max_redistributions IS 'Maximum redistribution attempts';