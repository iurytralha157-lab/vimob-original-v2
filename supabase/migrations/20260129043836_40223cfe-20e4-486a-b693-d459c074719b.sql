-- Add logo size configuration fields to organization_sites
ALTER TABLE public.organization_sites
ADD COLUMN IF NOT EXISTS logo_width integer DEFAULT 160,
ADD COLUMN IF NOT EXISTS logo_height integer DEFAULT 50;