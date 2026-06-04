-- RPC to count unique sessions efficiently
CREATE OR REPLACE FUNCTION public.count_unique_sessions(
  p_organization_id UUID,
  p_date_from TIMESTAMPTZ,
  p_date_to TIMESTAMPTZ
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT count(DISTINCT session_id)
  INTO v_count
  FROM lead_events
  WHERE organization_id = p_organization_id
    AND created_at >= p_date_from
    AND created_at <= p_date_to;
    
  return v_count;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.count_unique_sessions(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_unique_sessions(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

COMMENT ON FUNCTION public.count_unique_sessions IS 'Counts unique session_id in lead_events for an organization and period.';
