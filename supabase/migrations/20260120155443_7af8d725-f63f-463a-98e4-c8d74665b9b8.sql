-- Drop existing UPDATE policy if exists and create proper one
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can update users in their organization" ON public.users;

-- Users can update their own profile
CREATE POLICY "Users can update their own profile" 
ON public.users 
FOR UPDATE 
USING (id = auth.uid());

-- Admins can update any user in their organization
CREATE POLICY "Admins can update users in their organization" 
ON public.users 
FOR UPDATE 
USING (
  is_admin() AND organization_id = get_user_organization_id()
)
WITH CHECK (
  is_admin() AND organization_id = get_user_organization_id()
);

-- Super admins can update any user
CREATE POLICY "Super admins can update any user" 
ON public.users 
FOR UPDATE 
USING (is_super_admin())
WITH CHECK (is_super_admin());