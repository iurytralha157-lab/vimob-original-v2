-- Adicionar índice único para external_id por organização (necessário para upsert)
CREATE UNIQUE INDEX IF NOT EXISTS telecom_customers_org_external_id_idx 
ON telecom_customers (organization_id, external_id) 
WHERE external_id IS NOT NULL;