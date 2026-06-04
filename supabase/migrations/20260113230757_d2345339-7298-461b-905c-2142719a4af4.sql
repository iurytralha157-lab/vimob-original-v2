-- =====================================================
-- FIX: Infinite Recursion in WhatsApp RLS Policies
-- =====================================================

-- 1. Create SECURITY DEFINER functions to bypass RLS

-- Function to check if user has access to a session (via whatsapp_session_access)
CREATE OR REPLACE FUNCTION public.user_has_session_access(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_session_access
    WHERE session_id = p_session_id
    AND user_id = auth.uid()
  )
$$;

-- Function to check if user owns the session
CREATE OR REPLACE FUNCTION public.user_owns_session(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_sessions
    WHERE id = p_session_id
    AND owner_user_id = auth.uid()
  )
$$;

-- Function to check if session belongs to user's organization
CREATE OR REPLACE FUNCTION public.session_in_user_org(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_sessions
    WHERE id = p_session_id
    AND organization_id = public.get_user_organization_id()
  )
$$;

-- 2. Drop ALL existing policies on whatsapp_sessions
DROP POLICY IF EXISTS "Users can view sessions they own or have access to" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Users can create sessions in their org" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Session owners and admins can update" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Session owners and admins can delete" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "whatsapp_sessions_select_policy" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "whatsapp_sessions_insert_policy" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "whatsapp_sessions_update_policy" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "whatsapp_sessions_delete_policy" ON public.whatsapp_sessions;

-- 3. Drop ALL existing policies on whatsapp_session_access
DROP POLICY IF EXISTS "Users can view access grants for accessible sessions" ON public.whatsapp_session_access;
DROP POLICY IF EXISTS "Session owners and admins can manage access" ON public.whatsapp_session_access;
DROP POLICY IF EXISTS "whatsapp_session_access_select_policy" ON public.whatsapp_session_access;
DROP POLICY IF EXISTS "whatsapp_session_access_all_policy" ON public.whatsapp_session_access;

-- 4. Create new non-recursive policies for whatsapp_sessions

-- SELECT: Users can view sessions in their org if they own it, are admin, or have access
CREATE POLICY "whatsapp_sessions_select" ON public.whatsapp_sessions
FOR SELECT USING (
  organization_id = public.get_user_organization_id()
  AND (
    owner_user_id = auth.uid()
    OR public.is_admin()
    OR public.user_has_session_access(id)
  )
);

-- INSERT: Users can create sessions in their org as owner
CREATE POLICY "whatsapp_sessions_insert" ON public.whatsapp_sessions
FOR INSERT WITH CHECK (
  organization_id = public.get_user_organization_id()
  AND owner_user_id = auth.uid()
);

-- UPDATE: Only owner or admin can update
CREATE POLICY "whatsapp_sessions_update" ON public.whatsapp_sessions
FOR UPDATE USING (
  organization_id = public.get_user_organization_id()
  AND (owner_user_id = auth.uid() OR public.is_admin())
);

-- DELETE: Only owner or admin can delete
CREATE POLICY "whatsapp_sessions_delete" ON public.whatsapp_sessions
FOR DELETE USING (
  organization_id = public.get_user_organization_id()
  AND (owner_user_id = auth.uid() OR public.is_admin())
);

-- 5. Create new non-recursive policies for whatsapp_session_access

-- SELECT: Users can view access grants for sessions in their org
CREATE POLICY "whatsapp_session_access_select" ON public.whatsapp_session_access
FOR SELECT USING (
  public.session_in_user_org(session_id)
);

-- INSERT: Only session owner or admin can grant access
CREATE POLICY "whatsapp_session_access_insert" ON public.whatsapp_session_access
FOR INSERT WITH CHECK (
  public.user_owns_session(session_id) OR public.is_admin()
);

-- UPDATE: Only session owner or admin can update access
CREATE POLICY "whatsapp_session_access_update" ON public.whatsapp_session_access
FOR UPDATE USING (
  public.user_owns_session(session_id) OR public.is_admin()
);

-- DELETE: Only session owner or admin can revoke access
CREATE POLICY "whatsapp_session_access_delete" ON public.whatsapp_session_access
FOR DELETE USING (
  public.user_owns_session(session_id) OR public.is_admin()
);