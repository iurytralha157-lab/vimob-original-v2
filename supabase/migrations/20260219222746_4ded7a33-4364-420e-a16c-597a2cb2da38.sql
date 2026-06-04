
-- Create broker_monthly_goals table
CREATE TABLE public.broker_monthly_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  year integer NOT NULL,
  month integer NOT NULL,
  goal_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, year, month)
);

ALTER TABLE public.broker_monthly_goals ENABLE ROW LEVEL SECURITY;

-- Users can manage their own goals
CREATE POLICY "Users can manage own goals"
ON public.broker_monthly_goals
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Admins can view all goals in their org
CREATE POLICY "Admins can view all goals"
ON public.broker_monthly_goals
FOR SELECT
USING (
  organization_id = public.get_user_organization_id()
  AND (public.is_admin() OR public.is_super_admin())
);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_broker_monthly_goals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_broker_monthly_goals_updated_at
BEFORE UPDATE ON public.broker_monthly_goals
FOR EACH ROW
EXECUTE FUNCTION public.update_broker_monthly_goals_updated_at();
