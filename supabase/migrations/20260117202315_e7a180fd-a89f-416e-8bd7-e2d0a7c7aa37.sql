-- Update notifications.lead_id to CASCADE on delete (contracts was already updated)
ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_lead_id_fkey;

ALTER TABLE public.notifications
ADD CONSTRAINT notifications_lead_id_fkey
FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;