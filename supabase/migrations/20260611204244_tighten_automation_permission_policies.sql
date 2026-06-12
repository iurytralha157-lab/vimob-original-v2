-- Align automation RLS with the existing automations_view / automations_edit permissions.
-- This keeps read-only users from managing automations while preserving admin access.

UPDATE public.automation_nodes
SET
  position_x = COALESCE(position_x, 0),
  position_y = COALESCE(position_y, 0)
WHERE position_x IS NULL
   OR position_y IS NULL;

ALTER TABLE public.automation_nodes
  ALTER COLUMN position_x SET NOT NULL,
  ALTER COLUMN position_y SET NOT NULL;

DROP POLICY IF EXISTS "Org access to automations" ON public.automations;
DROP POLICY IF EXISTS "Super admin access automations" ON public.automations;

CREATE POLICY "Users can view automations"
ON public.automations
FOR SELECT
TO authenticated
USING (
  (
    public.is_super_admin()
    AND (
      public.get_user_organization_id() IS NULL
      OR organization_id = public.get_user_organization_id()
    )
  )
  OR (
    organization_id = public.get_user_organization_id()
    AND public.user_has_permission('automations_view')
  )
);

CREATE POLICY "Users can create automations"
ON public.automations
FOR INSERT
TO authenticated
WITH CHECK (
  (
    public.is_super_admin()
    AND (
      public.get_user_organization_id() IS NULL
      OR organization_id = public.get_user_organization_id()
    )
  )
  OR (
    organization_id = public.get_user_organization_id()
    AND public.user_has_permission('automations_edit')
  )
);

CREATE POLICY "Users can update automations"
ON public.automations
FOR UPDATE
TO authenticated
USING (
  (
    public.is_super_admin()
    AND (
      public.get_user_organization_id() IS NULL
      OR organization_id = public.get_user_organization_id()
    )
  )
  OR (
    organization_id = public.get_user_organization_id()
    AND public.user_has_permission('automations_edit')
  )
)
WITH CHECK (
  (
    public.is_super_admin()
    AND (
      public.get_user_organization_id() IS NULL
      OR organization_id = public.get_user_organization_id()
    )
  )
  OR (
    organization_id = public.get_user_organization_id()
    AND public.user_has_permission('automations_edit')
  )
);

CREATE POLICY "Users can delete automations"
ON public.automations
FOR DELETE
TO authenticated
USING (
  (
    public.is_super_admin()
    AND (
      public.get_user_organization_id() IS NULL
      OR organization_id = public.get_user_organization_id()
    )
  )
  OR (
    organization_id = public.get_user_organization_id()
    AND public.user_has_permission('automations_edit')
  )
);

DROP POLICY IF EXISTS "Org access to automation_nodes" ON public.automation_nodes;
DROP POLICY IF EXISTS "Super admin access automation_nodes" ON public.automation_nodes;

CREATE POLICY "Users can view automation nodes"
ON public.automation_nodes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.automations a
    WHERE a.id = automation_nodes.automation_id
  )
);

CREATE POLICY "Users can create automation nodes"
ON public.automation_nodes
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_permission('automations_edit')
  AND EXISTS (
    SELECT 1
    FROM public.automations a
    WHERE a.id = automation_nodes.automation_id
  )
);

CREATE POLICY "Users can update automation nodes"
ON public.automation_nodes
FOR UPDATE
TO authenticated
USING (
  public.user_has_permission('automations_edit')
  AND EXISTS (
    SELECT 1
    FROM public.automations a
    WHERE a.id = automation_nodes.automation_id
  )
)
WITH CHECK (
  public.user_has_permission('automations_edit')
  AND EXISTS (
    SELECT 1
    FROM public.automations a
    WHERE a.id = automation_nodes.automation_id
  )
);

CREATE POLICY "Users can delete automation nodes"
ON public.automation_nodes
FOR DELETE
TO authenticated
USING (
  public.user_has_permission('automations_edit')
  AND EXISTS (
    SELECT 1
    FROM public.automations a
    WHERE a.id = automation_nodes.automation_id
  )
);

DROP POLICY IF EXISTS "Admins can manage automation connections" ON public.automation_connections;
DROP POLICY IF EXISTS "Users can view automation connections" ON public.automation_connections;

CREATE POLICY "Users can view automation connections"
ON public.automation_connections
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.automations a
    WHERE a.id = automation_connections.automation_id
  )
);

CREATE POLICY "Users can create automation connections"
ON public.automation_connections
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_permission('automations_edit')
  AND EXISTS (
    SELECT 1
    FROM public.automations a
    WHERE a.id = automation_connections.automation_id
  )
);

CREATE POLICY "Users can update automation connections"
ON public.automation_connections
FOR UPDATE
TO authenticated
USING (
  public.user_has_permission('automations_edit')
  AND EXISTS (
    SELECT 1
    FROM public.automations a
    WHERE a.id = automation_connections.automation_id
  )
)
WITH CHECK (
  public.user_has_permission('automations_edit')
  AND EXISTS (
    SELECT 1
    FROM public.automations a
    WHERE a.id = automation_connections.automation_id
  )
);

CREATE POLICY "Users can delete automation connections"
ON public.automation_connections
FOR DELETE
TO authenticated
USING (
  public.user_has_permission('automations_edit')
  AND EXISTS (
    SELECT 1
    FROM public.automations a
    WHERE a.id = automation_connections.automation_id
  )
);

DROP POLICY IF EXISTS "Admins can manage automation templates" ON public.automation_templates;
DROP POLICY IF EXISTS "Users can view automation templates" ON public.automation_templates;

CREATE POLICY "Users can view automation templates"
ON public.automation_templates
FOR SELECT
TO authenticated
USING (
  (
    public.is_super_admin()
    AND (
      public.get_user_organization_id() IS NULL
      OR organization_id = public.get_user_organization_id()
    )
  )
  OR (
    organization_id = public.get_user_organization_id()
    AND public.user_has_permission('automations_view')
  )
);

CREATE POLICY "Users can manage automation templates"
ON public.automation_templates
FOR ALL
TO authenticated
USING (
  (
    public.is_super_admin()
    AND (
      public.get_user_organization_id() IS NULL
      OR organization_id = public.get_user_organization_id()
    )
  )
  OR (
    organization_id = public.get_user_organization_id()
    AND public.user_has_permission('automations_edit')
  )
)
WITH CHECK (
  (
    public.is_super_admin()
    AND (
      public.get_user_organization_id() IS NULL
      OR organization_id = public.get_user_organization_id()
    )
  )
  OR (
    organization_id = public.get_user_organization_id()
    AND public.user_has_permission('automations_edit')
  )
);

DROP POLICY IF EXISTS "Users can view automation executions" ON public.automation_executions;
DROP POLICY IF EXISTS "Users can start automation executions" ON public.automation_executions;
DROP POLICY IF EXISTS "Users can cancel running automation executions" ON public.automation_executions;

CREATE POLICY "Users can view automation executions"
ON public.automation_executions
FOR SELECT
TO authenticated
USING (
  (
    public.is_super_admin()
    AND (
      public.get_user_organization_id() IS NULL
      OR organization_id = public.get_user_organization_id()
    )
  )
  OR (
    organization_id = public.get_user_organization_id()
    AND public.user_has_permission('automations_view')
  )
);

CREATE POLICY "Users can start automation executions"
ON public.automation_executions
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = public.get_user_organization_id()
  AND public.user_has_permission('automations_view')
);

CREATE POLICY "Users can cancel running automation executions"
ON public.automation_executions
FOR UPDATE
TO authenticated
USING (
  organization_id = public.get_user_organization_id()
  AND public.user_has_permission('automations_view')
  AND status = ANY (ARRAY['running'::text, 'waiting'::text])
)
WITH CHECK (
  organization_id = public.get_user_organization_id()
  AND public.user_has_permission('automations_view')
  AND status = 'cancelled'::text
);
