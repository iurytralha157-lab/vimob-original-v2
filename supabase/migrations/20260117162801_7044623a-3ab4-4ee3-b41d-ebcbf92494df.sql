-- Fix trigger to handle INSERT correctly (no OLD record on insert)
CREATE OR REPLACE FUNCTION sync_user_role()
RETURNS TRIGGER AS $$
BEGIN
  -- On UPDATE, remove old admin role if changed from admin
  IF TG_OP = 'UPDATE' AND OLD.role = 'admin' AND NEW.role != 'admin' THEN
    DELETE FROM public.user_roles 
    WHERE user_id = NEW.id AND role = 'admin';
  END IF;
  
  -- Add new role if it's admin (on INSERT or UPDATE to admin)
  IF NEW.role = 'admin' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;