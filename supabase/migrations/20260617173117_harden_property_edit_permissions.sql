-- Keep properties visible to everyone in the organization, but restrict edits.
-- Admins/super admins can edit all org properties; captors/responsible users can
-- edit only the properties assigned to them.

DROP POLICY IF EXISTS "Users can manage properties" ON public.properties;
DROP POLICY IF EXISTS "properties_isolation" ON public.properties;
DROP POLICY IF EXISTS "Users can view org properties" ON public.properties;
DROP POLICY IF EXISTS "Super admin can view all properties" ON public.properties;
DROP POLICY IF EXISTS "Super admin can manage properties" ON public.properties;
DROP POLICY IF EXISTS "Super admin access properties" ON public.properties;
DROP POLICY IF EXISTS "Org users can view properties" ON public.properties;
DROP POLICY IF EXISTS "Org users can create properties" ON public.properties;
DROP POLICY IF EXISTS "Admins and captors can update properties" ON public.properties;
DROP POLICY IF EXISTS "Org admins can delete properties" ON public.properties;

CREATE POLICY "Org users can view properties"
ON public.properties
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR organization_id = public.get_user_organization_id()
);

CREATE POLICY "Org users can create properties"
ON public.properties
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR organization_id = public.get_user_organization_id()
);

CREATE POLICY "Admins and captors can update properties"
ON public.properties
FOR UPDATE
TO authenticated
USING (
  public.is_super_admin()
  OR (
    organization_id = public.get_user_organization_id()
    AND (
      public.is_admin()
      OR corretor_id = auth.uid()
      OR cadastrado_por = auth.uid()::text
    )
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    organization_id = public.get_user_organization_id()
    AND (
      public.is_admin()
      OR corretor_id = auth.uid()
      OR cadastrado_por = auth.uid()::text
    )
  )
);

CREATE POLICY "Org admins can delete properties"
ON public.properties
FOR DELETE
TO authenticated
USING (
  public.is_super_admin()
  OR (
    organization_id = public.get_user_organization_id()
    AND public.is_admin()
  )
);
