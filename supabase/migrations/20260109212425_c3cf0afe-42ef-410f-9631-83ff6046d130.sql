-- ================================================
-- FASE 1C: Políticas RLS para novas tabelas e super admin
-- ================================================

-- 1. Políticas RLS para organization_modules
CREATE POLICY "Super admin full access on organization_modules"
ON public.organization_modules
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Users can view own org modules"
ON public.organization_modules
FOR SELECT
TO authenticated
USING (organization_id = public.get_user_organization_id());

-- 2. Políticas RLS para super_admin_sessions
CREATE POLICY "Super admin manages sessions"
ON public.super_admin_sessions
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- 3. Super admin pode ver todas as organizations
CREATE POLICY "Super admin can view all organizations"
ON public.organizations
FOR SELECT
TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Super admin can update all organizations"
ON public.organizations
FOR UPDATE
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admin can insert organizations"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin());

-- 4. Super admin pode ver todos os usuários
CREATE POLICY "Super admin can view all users"
ON public.users
FOR SELECT
TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Super admin can update all users"
ON public.users
FOR UPDATE
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admin can insert users"
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin());

-- 5. Super admin pode gerenciar user_roles
CREATE POLICY "Super admin manages user_roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());