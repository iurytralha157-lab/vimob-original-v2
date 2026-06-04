-- =====================================================================
-- FASE 4 — Notificações Internas e Alertas (SuperAdmin)
-- =====================================================================

-- Trigger para notificar Super Admins sobre novas solicitações de onboarding
CREATE OR REPLACE FUNCTION public.notify_superadmins_onboarding_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  -- 1. Inserir evento no Feed Operacional da Plataforma
  INSERT INTO public.platform_events (
    type, 
    severity, 
    title, 
    description, 
    metadata
  ) VALUES (
    'onboarding_requested',
    'info',
    'Nova solicitação de onboarding',
    NEW.company_name || ' (' || NEW.responsible_name || ')',
    jsonb_build_object(
      'request_id', NEW.id,
      'email', NEW.responsible_email,
      'whatsapp', NEW.company_whatsapp
    )
  );

  -- 2. Inserir notificação interna para cada Super Admin
  FOR v_admin_id IN (SELECT id FROM public.users WHERE role = 'super_admin' AND is_active = true)
  LOOP
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      content
    ) VALUES (
      v_admin_id,
      'onboarding_request',
      'Nova solicitação de onboarding',
      'A empresa ' || NEW.company_name || ' solicitou acesso à plataforma. Analise agora.'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_superadmins_onboarding_request ON public.onboarding_requests;
CREATE TRIGGER trg_notify_superadmins_onboarding_request
  AFTER INSERT ON public.onboarding_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_superadmins_onboarding_request();

-- Também notificar no feed quando uma solicitação for aprovada/rejeitada
CREATE OR REPLACE FUNCTION public.log_onboarding_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.platform_events (
      type, 
      severity, 
      title, 
      description, 
      metadata
    ) VALUES (
      'onboarding_status_changed',
      CASE WHEN NEW.status = 'approved' THEN 'success' ELSE 'warning' END,
      'Solicitação de onboarding ' || NEW.status,
      NEW.company_name,
      jsonb_build_object(
        'request_id', NEW.id,
        'old_status', OLD.status,
        'new_status', NEW.status
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_onboarding_status_change ON public.onboarding_requests;
CREATE TRIGGER trg_log_onboarding_status_change
  AFTER UPDATE OF status ON public.onboarding_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_onboarding_status_change();
