-- Fix: Add ON DELETE CASCADE to notifications.lead_id foreign key
-- This allows leads to be deleted even when they have associated notifications

ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_lead_id_fkey;

ALTER TABLE public.notifications
ADD CONSTRAINT notifications_lead_id_fkey
FOREIGN KEY (lead_id)
REFERENCES public.leads(id)
ON DELETE CASCADE;