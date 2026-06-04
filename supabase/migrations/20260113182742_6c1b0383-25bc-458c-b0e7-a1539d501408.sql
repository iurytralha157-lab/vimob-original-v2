-- Add target_tag_ids column to webhooks_integrations table
ALTER TABLE public.webhooks_integrations 
ADD COLUMN target_tag_ids uuid[] DEFAULT '{}' NOT NULL;