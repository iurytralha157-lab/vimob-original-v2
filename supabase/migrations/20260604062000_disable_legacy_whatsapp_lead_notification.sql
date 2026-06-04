CREATE OR REPLACE FUNCTION public.notify_whatsapp_on_lead(
  p_org_id uuid,
  p_user_id uuid,
  p_lead_name text,
  p_source text DEFAULT 'desconhecida'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Legacy WhatsApp lead notification disabled.
  -- Lead assignment WhatsApp messages are sent by notify_new_lead using the unified template.
  RETURN;
END;
$$;
