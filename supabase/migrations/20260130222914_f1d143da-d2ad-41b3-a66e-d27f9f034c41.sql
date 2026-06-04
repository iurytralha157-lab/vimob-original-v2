-- Add columns for extras and proximities
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS detalhes_extras text[] DEFAULT '{}';

ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS proximidades text[] DEFAULT '{}';