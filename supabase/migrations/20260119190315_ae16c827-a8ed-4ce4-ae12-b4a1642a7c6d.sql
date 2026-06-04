-- Fix RLS policies for onboarding flow

-- Update pipelines policy to allow organization creators
DROP POLICY IF EXISTS "Admins can manage pipelines" ON pipelines;

CREATE POLICY "Admins can manage pipelines" ON pipelines
FOR ALL USING (
  organization_id = get_user_organization_id() 
  AND (is_admin() OR 
       EXISTS (
         SELECT 1 FROM organizations o 
         WHERE o.id = pipelines.organization_id 
         AND o.created_by = auth.uid()
       ))
);

-- Update stages policy to allow organization creators
DROP POLICY IF EXISTS "Admins can manage stages" ON stages;

CREATE POLICY "Admins can manage stages" ON stages
FOR ALL USING (
  pipeline_id IN (
    SELECT id FROM pipelines WHERE organization_id = get_user_organization_id()
  ) 
  AND (is_admin() OR 
       EXISTS (
         SELECT 1 FROM organizations o 
         JOIN pipelines p ON p.organization_id = o.id
         WHERE p.id = stages.pipeline_id
         AND o.created_by = auth.uid()
       ))
);

-- Update meta_integrations policy
DROP POLICY IF EXISTS "meta_integrations_insert" ON meta_integrations;
DROP POLICY IF EXISTS "Users can create meta integration for their org" ON meta_integrations;

CREATE POLICY "Users can create meta integration for their org" ON meta_integrations
FOR INSERT WITH CHECK (
  organization_id = get_user_organization_id() OR
  EXISTS (
    SELECT 1 FROM organizations o 
    WHERE o.id = meta_integrations.organization_id 
    AND o.created_by = auth.uid()
  )
);