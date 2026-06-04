-- Add policy to allow users to see organizations they are members of
CREATE POLICY "Users can view organizations they are members of" ON organizations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid()
    AND organization_id = organizations.id
  )
);
