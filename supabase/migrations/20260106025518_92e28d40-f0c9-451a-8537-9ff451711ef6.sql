-- Allow authenticated users to create an organization during onboarding (only if they don't have one yet)
CREATE POLICY "New users can create organization during onboarding" 
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (
  NOT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND organization_id IS NOT NULL
  )
);

-- Allow users to create their first admin role during onboarding
CREATE POLICY "Users can create their first role during onboarding"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
  )
);