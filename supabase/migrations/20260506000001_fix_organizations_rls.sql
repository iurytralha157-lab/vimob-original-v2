-- Drop the existing restrictive policies if they exist or just add the new one
-- The existing policy "Users can view their organization" might be named differently in some environments
-- but we saw "organizations_select_member" and "Users can view their organization" in the previous check.

-- Add a more inclusive policy for selecting organizations
CREATE POLICY "Users can view all organizations they are members of" ON organizations
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM organization_members 
    WHERE organization_members.user_id = auth.uid() 
    AND organization_members.organization_id = organizations.id
  )
);

-- Also ensure organization_members has proper SELECT policy for the user's own memberships
-- (It already has "Users can view own memberships" but let's be sure)
