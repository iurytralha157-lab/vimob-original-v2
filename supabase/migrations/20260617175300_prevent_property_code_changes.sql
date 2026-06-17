-- Property codes are stable public identifiers. App users must not change them
-- during regular edits; otherwise listings can "disappear" from code searches.

CREATE OR REPLACE FUNCTION public.prevent_property_code_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code
     AND coalesce(auth.role(), '') <> 'service_role'
  THEN
    RAISE EXCEPTION 'Property code cannot be changed after creation'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_property_code_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_property_code_change() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_property_code_change() FROM authenticated;

DROP TRIGGER IF EXISTS prevent_property_code_change ON public.properties;

CREATE TRIGGER prevent_property_code_change
BEFORE UPDATE OF code ON public.properties
FOR EACH ROW
EXECUTE FUNCTION public.prevent_property_code_change();
