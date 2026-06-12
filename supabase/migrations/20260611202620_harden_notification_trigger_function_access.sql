-- Harden notification trigger/helper functions so they cannot be called directly through PostgREST RPC.

REVOKE EXECUTE ON FUNCTION public.trigger_push_notification() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_push_notification() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trigger_push_notification() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_push_notification() TO service_role;

REVOKE EXECUTE ON FUNCTION public.notify_new_lead() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_new_lead() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_new_lead() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.notify_new_lead() TO service_role;

REVOKE EXECUTE ON FUNCTION public.notify_lead_assigned() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_lead_assigned() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_lead_assigned() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.notify_lead_assigned() TO service_role;

ALTER FUNCTION public.create_notification(uuid, uuid, text, text, text, uuid)
SET search_path = public;
