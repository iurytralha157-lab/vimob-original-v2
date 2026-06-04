-- Create unique index for upsert on telecom_customers
CREATE UNIQUE INDEX IF NOT EXISTS telecom_customers_org_external_id_unique 
ON public.telecom_customers (organization_id, external_id) 
WHERE external_id IS NOT NULL;