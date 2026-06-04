-- Add composite index to optimize organization membership checks
CREATE INDEX IF NOT EXISTS idx_organization_members_user_active 
ON public.organization_members (user_id, is_active);

COMMENT ON INDEX idx_organization_members_user_active IS 'Accelerates checkMultiOrg and other queries filtering by user and active status.';
