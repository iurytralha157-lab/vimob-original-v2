ALTER TABLE public.round_robins 
ADD COLUMN IF NOT EXISTS ai_agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL;