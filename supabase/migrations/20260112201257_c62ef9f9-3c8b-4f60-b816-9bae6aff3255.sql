-- Remove old policies with dangerous fallback
DROP POLICY IF EXISTS "Hierarchical lead access" ON public.leads;
DROP POLICY IF EXISTS "Hierarchical lead management" ON public.leads;
DROP POLICY IF EXISTS "Hierarchical pipeline access" ON public.pipelines;

-- Create proper management policies for leads (INSERT, UPDATE, DELETE)
CREATE POLICY "Strict lead management"
ON public.leads
FOR ALL
USING (
  organization_id = get_user_organization_id()
  AND (
    is_admin()
    OR (
      is_team_leader() 
      AND (
        pipeline_id IN (
          SELECT pipeline_id FROM public.team_pipelines 
          WHERE team_id IN (SELECT get_user_led_team_ids())
        )
        OR assigned_user_id IN (SELECT get_led_team_member_ids())
      )
    )
    OR assigned_user_id = auth.uid()
  )
)
WITH CHECK (
  organization_id = get_user_organization_id()
  AND (
    is_admin()
    OR (
      is_team_leader() 
      AND (
        pipeline_id IN (
          SELECT pipeline_id FROM public.team_pipelines 
          WHERE team_id IN (SELECT get_user_led_team_ids())
        )
        OR assigned_user_id IN (SELECT get_led_team_member_ids())
      )
    )
    OR assigned_user_id = auth.uid()
  )
);

-- Create proper management policy for pipelines (only admins can manage)
CREATE POLICY "Strict pipeline management"
ON public.pipelines
FOR ALL
USING (
  organization_id = get_user_organization_id()
  AND is_admin()
)
WITH CHECK (
  organization_id = get_user_organization_id()
  AND is_admin()
);