-- Add lead_id column to telecom_customers to link customers to leads
ALTER TABLE telecom_customers 
ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES leads(id) ON DELETE SET NULL;

-- Create unique index to ensure 1:1 relationship between lead and customer
CREATE UNIQUE INDEX IF NOT EXISTS telecom_customers_lead_id_unique 
ON telecom_customers(lead_id) WHERE lead_id IS NOT NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_telecom_customers_lead_id 
ON telecom_customers(lead_id);