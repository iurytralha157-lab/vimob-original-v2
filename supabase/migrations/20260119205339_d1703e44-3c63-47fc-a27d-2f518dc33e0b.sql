-- Create member_availability table for scheduling team members
CREATE TABLE public.member_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME,
  end_time TIME,
  is_all_day BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(team_member_id, day_of_week)
);

-- Enable RLS
ALTER TABLE public.member_availability ENABLE ROW LEVEL SECURITY;

-- RLS policy for organization access
CREATE POLICY "Users can view their org member availability" 
ON public.member_availability 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    JOIN public.users u ON u.organization_id = t.organization_id
    WHERE tm.id = member_availability.team_member_id
    AND u.id = auth.uid()
  )
);

CREATE POLICY "Admins can manage member availability" 
ON public.member_availability 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    JOIN public.users u ON u.organization_id = t.organization_id
    WHERE tm.id = member_availability.team_member_id
    AND u.id = auth.uid()
    AND u.role IN ('admin', 'manager')
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_member_availability_updated_at
  BEFORE UPDATE ON public.member_availability
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();