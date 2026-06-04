-- Sync leads_count on round_robin_members from actual assignments_log data
UPDATE round_robin_members rrm
SET leads_count = sub.real_count
FROM (
  SELECT al.round_robin_id, al.assigned_user_id, COUNT(*) as real_count
  FROM assignments_log al
  WHERE al.round_robin_id IS NOT NULL
    AND al.assigned_user_id IS NOT NULL
  GROUP BY al.round_robin_id, al.assigned_user_id
) sub
WHERE rrm.round_robin_id = sub.round_robin_id
  AND rrm.user_id = sub.assigned_user_id;