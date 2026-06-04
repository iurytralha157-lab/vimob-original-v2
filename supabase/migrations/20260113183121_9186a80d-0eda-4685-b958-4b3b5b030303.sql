-- Add target_property_id column to webhooks_integrations table
ALTER TABLE public.webhooks_integrations 
ADD COLUMN target_property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL;