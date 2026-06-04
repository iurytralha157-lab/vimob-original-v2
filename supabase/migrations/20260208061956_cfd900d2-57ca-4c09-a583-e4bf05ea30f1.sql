-- Fix: Set search_path on the trigger function
CREATE OR REPLACE FUNCTION public.update_meta_form_configs_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;