-- Remove incorrect trigger from stages table
-- The stages table uses pipeline_id, not organization_id
DROP TRIGGER IF EXISTS enforce_org_stages ON public.stages;