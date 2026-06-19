-- Returns the current owner for a duplicate lead phone inside the caller organization.
-- This keeps the create-lead UX clear without exposing conversations or lead details.

CREATE OR REPLACE FUNCTION public.find_duplicate_lead_by_phone(p_phone text)
RETURNS TABLE (
  lead_id uuid,
  lead_name text,
  responsible_user_id uuid,
  responsible_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_organization_id uuid;
  v_phone_key text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT organization_id
  INTO v_organization_id
  FROM public.users
  WHERE id = v_user_id;

  IF v_organization_id IS NULL THEN
    RETURN;
  END IF;

  v_phone_key := public.normalize_phone(p_phone);

  IF v_phone_key IS NULL OR v_phone_key = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    l.id AS lead_id,
    l.name AS lead_name,
    l.assigned_user_id AS responsible_user_id,
    COALESCE(u.name, 'Sem responsável') AS responsible_name
  FROM public.leads l
  LEFT JOIN public.users u ON u.id = l.assigned_user_id
  WHERE l.organization_id = v_organization_id
    AND public.normalize_phone(l.phone) = v_phone_key
  ORDER BY l.created_at ASC, l.id ASC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.find_duplicate_lead_by_phone(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_duplicate_lead_by_phone(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.find_duplicate_lead_by_phone(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_duplicate_lead_by_phone(text) TO service_role;
