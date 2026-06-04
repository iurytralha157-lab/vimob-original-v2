-- Setup Guide Progress: persist per-user completion in DB
CREATE TABLE IF NOT EXISTS public.setup_guide_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_steps jsonb NOT NULL DEFAULT '{}'::jsonb,
  skipped boolean NOT NULL DEFAULT false,
  active_step text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.setup_guide_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own setup progress" ON public.setup_guide_progress;
CREATE POLICY "Users can view own setup progress"
  ON public.setup_guide_progress FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own setup progress" ON public.setup_guide_progress;
CREATE POLICY "Users can insert own setup progress"
  ON public.setup_guide_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own setup progress" ON public.setup_guide_progress;
CREATE POLICY "Users can update own setup progress"
  ON public.setup_guide_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_setup_guide_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_setup_guide_progress ON public.setup_guide_progress;
CREATE TRIGGER trg_touch_setup_guide_progress
  BEFORE UPDATE ON public.setup_guide_progress
  FOR EACH ROW EXECUTE FUNCTION public.touch_setup_guide_progress();
