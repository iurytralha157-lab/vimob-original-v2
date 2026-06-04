-- Add new columns to meta_integrations table
ALTER TABLE public.meta_integrations
  ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES public.pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES public.stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_status TEXT DEFAULT 'novo',
  ADD COLUMN IF NOT EXISTS leads_received INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_lead_at TIMESTAMPTZ;

-- Add Meta-specific columns to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS meta_lead_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS meta_form_id TEXT;

-- Create index for fast lookup by meta_lead_id
CREATE INDEX IF NOT EXISTS idx_leads_meta_lead_id ON public.leads(meta_lead_id);

-- Create index for meta_integrations by page_id
CREATE INDEX IF NOT EXISTS idx_meta_integrations_page_id ON public.meta_integrations(page_id);