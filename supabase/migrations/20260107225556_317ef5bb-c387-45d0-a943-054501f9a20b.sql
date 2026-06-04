-- Add logo_size column to organizations table
ALTER TABLE public.organizations 
ADD COLUMN logo_size integer DEFAULT 32;