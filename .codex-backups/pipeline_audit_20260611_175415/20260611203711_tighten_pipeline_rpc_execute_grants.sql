-- Remove default public/anon function execution and grant only the intended roles.

REVOKE ALL ON FUNCTION public.get_sla_pending_leads() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_sla_pending_leads() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_sla_pending_leads() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sla_pending_leads() TO service_role;

REVOKE ALL ON FUNCTION public.get_sla_start_at(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_sla_start_at(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_sla_start_at(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sla_start_at(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.move_lead_stage(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.move_lead_stage(uuid, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.move_lead_stage(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_lead_stage(uuid, uuid, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.redistribute_lead_round_robin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redistribute_lead_round_robin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.redistribute_lead_round_robin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redistribute_lead_round_robin(uuid) TO service_role;
