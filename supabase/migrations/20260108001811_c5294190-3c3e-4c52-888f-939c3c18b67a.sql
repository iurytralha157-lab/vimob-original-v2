-- Update leads RLS policy to filter based on role hierarchy
-- First drop existing policies
DROP POLICY IF EXISTS "Users can manage org leads" ON public.leads;
DROP POLICY IF EXISTS "Users can view org leads" ON public.leads;
DROP POLICY IF EXISTS "Hierarchical lead access" ON public.leads;
DROP POLICY IF EXISTS "Hierarchical lead management" ON public.leads;

-- Create new hierarchical view policy for leads
CREATE POLICY "Hierarchical lead access"
ON public.leads
FOR SELECT
USING (
  organization_id = get_user_organization_id()
  AND (
    -- Admin sees all leads in org
    is_admin()
    -- Team leaders see all leads in their teams' pipelines
    OR (
      is_team_leader() 
      AND pipeline_id IN (
        SELECT pipeline_id FROM public.team_pipelines 
        WHERE team_id IN (SELECT get_user_led_team_ids())
      )
    )
    -- Regular users only see leads assigned to them
    OR assigned_user_id = auth.uid()
    -- Also allow viewing if pipeline is not assigned to any team yet (fallback for admins setting up)
    OR (
      NOT EXISTS (SELECT 1 FROM public.team_pipelines WHERE pipeline_id = leads.pipeline_id)
    )
  )
);

-- Create new hierarchical manage policy for leads (INSERT, UPDATE, DELETE)
CREATE POLICY "Hierarchical lead management"
ON public.leads
FOR ALL
USING (
  organization_id = get_user_organization_id()
  AND (
    -- Admin can manage all leads in org
    is_admin()
    -- Team leaders can manage leads in their teams' pipelines
    OR (
      is_team_leader() 
      AND pipeline_id IN (
        SELECT pipeline_id FROM public.team_pipelines 
        WHERE team_id IN (SELECT get_user_led_team_ids())
      )
    )
    -- Regular users can manage leads assigned to them
    OR assigned_user_id = auth.uid()
    -- Fallback for unassigned pipelines
    OR (
      NOT EXISTS (SELECT 1 FROM public.team_pipelines WHERE pipeline_id = leads.pipeline_id)
    )
  )
);

-- Update pipelines RLS to allow team members to view their assigned pipelines
DROP POLICY IF EXISTS "Users can view org pipelines" ON public.pipelines;
DROP POLICY IF EXISTS "Hierarchical pipeline access" ON public.pipelines;

CREATE POLICY "Hierarchical pipeline access"
ON public.pipelines
FOR SELECT
USING (
  organization_id = get_user_organization_id()
  AND (
    -- Admin sees all pipelines
    is_admin()
    -- Team members see pipelines assigned to their teams
    OR id IN (
      SELECT pipeline_id FROM public.team_pipelines 
      WHERE team_id IN (SELECT get_user_team_ids())
    )
    -- Fallback: if no team_pipelines exist in org, show all org pipelines
    OR NOT EXISTS (
      SELECT 1 FROM public.team_pipelines tp 
      JOIN public.teams t ON tp.team_id = t.id 
      WHERE t.organization_id = get_user_organization_id()
    )
  )
);