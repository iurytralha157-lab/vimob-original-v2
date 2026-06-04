-- Add observation and recommended_message columns to cadence_tasks_template
ALTER TABLE public.cadence_tasks_template
ADD COLUMN observation TEXT,
ADD COLUMN recommended_message TEXT;