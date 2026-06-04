-- Add logo size columns to system_settings
ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS logo_width integer DEFAULT 140,
ADD COLUMN IF NOT EXISTS logo_height integer DEFAULT 40;