-- Fix: notify_superadmins_onboarding_request was inserting into notifications
-- without organization_id, violating NOT NULL constraint and breaking submit-onboarding.
CREATE OR REPLACE FUNCTION public.notify_superadmins_onboarding_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin record;
BEGIN
  INSERT INTO public.platform_events (type, severity, title, description, metadata)
  VALUES ('onboarding_requested', 'info', 'Nova solicitação de onboarding',
          NEW.company_name || ' (' || NEW.responsible_name || ')',
          jsonb_build_object('request_id', NEW.id, 'email', NEW.responsible_email));

  FOR v_admin IN
    SELECT id, organization_id
    FROM public.users
    WHERE role = 'super_admin' AND is_active = true AND organization_id IS NOT NULL
  LOOP
    INSERT INTO public.notifications (user_id, organization_id, type, title, content)
    VALUES (v_admin.id, v_admin.organization_id, 'onboarding_request',
            'Nova solicitação de onboarding',
            'A empresa ' || NEW.company_name || ' solicitou acesso.');
  END LOOP;
  RETURN NEW;
END;
$$;
