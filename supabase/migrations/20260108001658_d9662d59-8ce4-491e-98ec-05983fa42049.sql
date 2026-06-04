-- Create team_pipelines junction table to link teams to pipelines
CREATE TABLE IF NOT EXISTS public.team_pipelines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(team_id, pipeline_id)
);

-- Enable RLS on team_pipelines
ALTER TABLE public.team_pipelines ENABLE ROW LEVEL SECURITY;

-- RLS policies for team_pipelines
CREATE POLICY "Users can view team pipelines in their org"
ON public.team_pipelines
FOR SELECT
USING (
  team_id IN (
    SELECT id FROM public.teams WHERE organization_id = get_user_organization_id()
  )
);

CREATE POLICY "Admins can manage team pipelines"
ON public.team_pipelines
FOR ALL
USING (
  team_id IN (
    SELECT id FROM public.teams WHERE organization_id = get_user_organization_id()
  )
  AND is_admin()
);