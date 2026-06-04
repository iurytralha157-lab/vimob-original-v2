-- Function to check if user is team leader
CREATE OR REPLACE FUNCTION public.is_team_leader()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = auth.uid() AND is_leader = true
  )
$$;

-- Function to get user's team IDs (where they are a member)
CREATE OR REPLACE FUNCTION public.get_user_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
$$;

-- Function to get user's led team IDs (where they are a leader)
CREATE OR REPLACE FUNCTION public.get_user_led_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id FROM public.team_members WHERE user_id = auth.uid() AND is_leader = true
$$;