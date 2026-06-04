-- Fix normalize_phone function with secure search_path
CREATE OR REPLACE FUNCTION public.normalize_phone(phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF phone IS NULL OR phone = '' THEN
    RETURN NULL;
  END IF;
  phone := regexp_replace(phone, '[^0-9]', '', 'g');
  IF length(phone) >= 12 AND phone LIKE '55%' THEN
    phone := substring(phone from 3);
  END IF;
  RETURN phone;
END;
$$;