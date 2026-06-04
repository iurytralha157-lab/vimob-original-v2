-- Fix RLS for notification_templates
DROP POLICY IF EXISTS "Super Admins access" ON notification_templates;

CREATE POLICY "Allow authenticated users to read templates"
ON notification_templates FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Super Admins manage templates"
ON notification_templates FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid() AND (users.role = 'super_admin' OR users.is_super_admin = true)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid() AND (users.role = 'super_admin' OR users.is_super_admin = true)
  )
);

-- Fix RLS for notification_logs
DROP POLICY IF EXISTS "Super Admins logs access" ON notification_logs;

CREATE POLICY "Allow authenticated users to insert logs"
ON notification_logs FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Super Admins read all logs"
ON notification_logs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid() AND (users.role = 'super_admin' OR users.is_super_admin = true)
  )
);

CREATE POLICY "Super Admins delete logs"
ON notification_logs FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid() AND (users.role = 'super_admin' OR users.is_super_admin = true)
  )
);
