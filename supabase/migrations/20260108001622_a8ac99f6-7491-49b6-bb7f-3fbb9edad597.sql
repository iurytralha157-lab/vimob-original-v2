-- Step 1: Add is_leader column to team_members (if not exists)
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS is_leader BOOLEAN DEFAULT false;