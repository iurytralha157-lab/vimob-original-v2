ALTER TABLE public.organization_sites
  ADD COLUMN IF NOT EXISTS head_scripts text,
  ADD COLUMN IF NOT EXISTS body_scripts text;
