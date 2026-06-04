-- Update RLS for schedule_events to be fully collaborative within organization

-- Drop restrictive policies
DROP POLICY IF EXISTS "Users can insert own events" ON public.schedule_events;
DROP POLICY IF EXISTS "Users can update own events" ON public.schedule_events;
DROP POLICY IF EXISTS "Users can delete own events" ON public.schedule_events;

-- Add collaborative policies
CREATE POLICY "Org members can insert schedule events"
ON public.schedule_events
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = get_user_organization_id()
);

CREATE POLICY "Org members can update schedule events"
ON public.schedule_events
FOR UPDATE
TO authenticated
USING (
  organization_id = get_user_organization_id()
)
WITH CHECK (
  organization_id = get_user_organization_id()
);

CREATE POLICY "Org members can delete schedule events"
ON public.schedule_events
FOR DELETE
TO authenticated
USING (
  organization_id = get_user_organization_id()
);
