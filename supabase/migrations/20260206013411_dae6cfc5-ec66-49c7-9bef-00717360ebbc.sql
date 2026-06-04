-- Add tracking fields to lead_meta table
ALTER TABLE lead_meta 
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content text,
  ADD COLUMN IF NOT EXISTS utm_term text,
  ADD COLUMN IF NOT EXISTS form_name text,
  ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'meta',
  ADD COLUMN IF NOT EXISTS contact_notes text;

-- Add comment for documentation
COMMENT ON COLUMN lead_meta.source_type IS 'Origin type: meta (Facebook/Instagram) or webhook (external integrations)';
COMMENT ON COLUMN lead_meta.utm_source IS 'UTM source parameter (e.g., google, facebook)';
COMMENT ON COLUMN lead_meta.utm_medium IS 'UTM medium parameter (e.g., cpc, email, social)';
COMMENT ON COLUMN lead_meta.utm_campaign IS 'UTM campaign parameter';
COMMENT ON COLUMN lead_meta.utm_content IS 'UTM content parameter';
COMMENT ON COLUMN lead_meta.utm_term IS 'UTM term parameter (search keywords)';
COMMENT ON COLUMN lead_meta.form_name IS 'Name of the form that captured the lead';
COMMENT ON COLUMN lead_meta.contact_notes IS 'Additional notes about the contact';