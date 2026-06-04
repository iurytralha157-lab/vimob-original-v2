-- Fix infinite recursion in whatsapp_sessions RLS policies

-- Create security definer function to check session access without triggering RLS
CREATE OR REPLACE FUNCTION public.user_has_session_access(session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM whatsapp_session_access wsa
    WHERE wsa.session_id = $1 
    AND wsa.user_id = auth.uid() 
    AND wsa.can_view = true
  )
$$;

-- Create function to get session owner without triggering RLS
CREATE OR REPLACE FUNCTION public.get_session_owner(session_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT owner_user_id 
  FROM whatsapp_sessions 
  WHERE id = $1
$$;

-- Create function to check if user owns or has access to manage session
CREATE OR REPLACE FUNCTION public.can_manage_session(session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM whatsapp_sessions ws
    WHERE ws.id = $1
    AND ws.organization_id = get_user_organization_id()
    AND (ws.owner_user_id = auth.uid() OR is_admin())
  )
$$;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view sessions they own or have access to" ON whatsapp_sessions;
DROP POLICY IF EXISTS "Users can create sessions in their org" ON whatsapp_sessions;
DROP POLICY IF EXISTS "Session owners and admins can update" ON whatsapp_sessions;
DROP POLICY IF EXISTS "Session owners and admins can delete" ON whatsapp_sessions;

-- Recreate SELECT policy using security definer function
CREATE POLICY "Users can view sessions they own or have access to" ON whatsapp_sessions
FOR SELECT USING (
  organization_id = get_user_organization_id() 
  AND (
    owner_user_id = auth.uid() 
    OR is_admin() 
    OR user_has_session_access(id)
  )
);

-- Recreate INSERT policy
CREATE POLICY "Users can create sessions in their org" ON whatsapp_sessions
FOR INSERT WITH CHECK (
  organization_id = get_user_organization_id() 
  AND owner_user_id = auth.uid()
);

-- Recreate UPDATE policy
CREATE POLICY "Session owners and admins can update" ON whatsapp_sessions
FOR UPDATE USING (
  organization_id = get_user_organization_id() 
  AND (owner_user_id = auth.uid() OR is_admin())
);

-- Recreate DELETE policy
CREATE POLICY "Session owners and admins can delete" ON whatsapp_sessions
FOR DELETE USING (
  organization_id = get_user_organization_id() 
  AND (owner_user_id = auth.uid() OR is_admin())
);

-- Fix whatsapp_session_access policies to use security definer function
DROP POLICY IF EXISTS "Session owners and admins can manage access" ON whatsapp_session_access;
DROP POLICY IF EXISTS "Users can view access grants for accessible sessions" ON whatsapp_session_access;

CREATE POLICY "Session owners and admins can manage access" ON whatsapp_session_access
FOR ALL USING (can_manage_session(session_id));

CREATE POLICY "Users can view access grants for accessible sessions" ON whatsapp_session_access
FOR SELECT USING (
  can_manage_session(session_id) OR user_id = auth.uid()
);