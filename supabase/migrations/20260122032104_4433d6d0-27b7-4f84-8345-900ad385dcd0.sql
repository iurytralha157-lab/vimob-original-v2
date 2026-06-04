-- Disable ALL after insert triggers temporarily
ALTER TABLE public.leads DISABLE TRIGGER trigger_lead_intake;
ALTER TABLE public.leads DISABLE TRIGGER trigger_notify_new_lead;