-- Harden notification-related RLS without changing existing data.

-- 1) Notifications: users should not read every notification in their organization.
DROP POLICY IF EXISTS "Users can view their notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Admins can view all org notifications" ON public.notifications;

CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can view org notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (
  organization_id = public.get_user_organization_id()
  AND public.is_admin()
);

DROP POLICY IF EXISTS "Users can update their notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications"
ON public.notifications
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Keep existing insert behavior for now to avoid breaking client fallbacks, but scope it to authenticated users.
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
CREATE POLICY "Authenticated users can create org notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (organization_id = public.get_user_organization_id());

-- 2) Push tokens: users may only register tokens for their current organization.
DROP POLICY IF EXISTS "Users can insert their own tokens" ON public.push_tokens;
CREATE POLICY "Users can insert their own org tokens"
ON public.push_tokens
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND organization_id = public.get_user_organization_id()
);

DROP POLICY IF EXISTS "Users can update their own tokens" ON public.push_tokens;
CREATE POLICY "Users can update their own org tokens"
ON public.push_tokens
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND organization_id = public.get_user_organization_id()
);

-- 3) Notification settings: manage only own organization, except super admin.
DROP POLICY IF EXISTS "Admins can manage notification settings" ON public.notification_settings;
CREATE POLICY "Admins can manage own org notification settings"
ON public.notification_settings
FOR ALL
TO authenticated
USING (
  public.is_super_admin()
  OR (
    organization_id = public.get_user_organization_id()
    AND public.is_admin()
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    organization_id = public.get_user_organization_id()
    AND public.is_admin()
  )
);

-- 4) Do not expose create_notification as a public RPC. Triggers and service role can still use it.
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, uuid, text, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, uuid, text, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, uuid, text, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, uuid, text, text, text, uuid) TO service_role;

-- 5) Query support for the existing notification UI and dedupe checks.
CREATE INDEX IF NOT EXISTS idx_notifications_user_org_created_at_desc
ON public.notifications (user_id, organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread_user_org
ON public.notifications (user_id, organization_id)
WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notification_logs_dedupe_created_at_desc
ON public.notification_logs (dedupe_key, created_at DESC)
WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_logs_org_created_at_desc
ON public.notification_logs (organization_id, created_at DESC);
