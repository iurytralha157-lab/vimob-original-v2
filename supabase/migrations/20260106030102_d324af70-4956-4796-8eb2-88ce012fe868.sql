-- Create a security definer function to check if user has organization (bypasses RLS)
CREATE OR REPLACE FUNCTION public.user_has_organization()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND organization_id IS NOT NULL
  )
$$;

-- Drop the old policy that doesn't work due to RLS on users table
DROP POLICY IF EXISTS "New users can create organization during onboarding" ON public.organizations;

-- Create new policy using the security definer function
CREATE POLICY "New users can create organization during onboarding" 
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (NOT public.user_has_organization());