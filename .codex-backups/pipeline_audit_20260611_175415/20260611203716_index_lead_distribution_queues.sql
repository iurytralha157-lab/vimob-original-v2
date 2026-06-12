-- Support lead distribution queue lookups used by pipeline redistribution.

CREATE INDEX IF NOT EXISTS idx_round_robin_rules_queue_active_priority
  ON public.round_robin_rules (round_robin_id, is_active, priority DESC);

CREATE INDEX IF NOT EXISTS idx_round_robin_members_queue_position
  ON public.round_robin_members (round_robin_id, position);

CREATE INDEX IF NOT EXISTS idx_assignments_log_round_robin
  ON public.assignments_log (round_robin_id)
  WHERE round_robin_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assignments_log_assigned_user
  ON public.assignments_log (assigned_user_id)
  WHERE assigned_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assignments_log_organization
  ON public.assignments_log (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_round_robin_logs_round_robin
  ON public.round_robin_logs (round_robin_id)
  WHERE round_robin_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_round_robin_logs_organization
  ON public.round_robin_logs (organization_id)
  WHERE organization_id IS NOT NULL;
