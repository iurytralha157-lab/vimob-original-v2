-- Enable only notify_new_lead trigger to test
ALTER TABLE public.leads ENABLE TRIGGER trigger_notify_new_lead;