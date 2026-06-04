-- Phase 11: Fix duplicate lead-intake notifications
-- Problem: assignee was receiving 3 notifications per new lead due to overlapping triggers.
-- Fix:
--   1) Drop duplicate trigger trg_notify_lead_assigned
--   2) Drop trigger_notify_lead_first_assignment (overlaps with notify_new_lead + notify_lead_assigned)
--   3) Rewrite notify_new_lead() to handle BOTH INSERT and first-assignment UPDATE,
--      sending exactly ONE notification per recipient
--   4) Restrict notify_lead_assigned() to reassignments only (OLD.assigned_user_id NOT NULL)

DROP TRIGGER IF EXISTS trg_notify_lead_assigned ON public.leads;
DROP TRIGGER IF EXISTS trigger_notify_lead_first_assignment ON public.leads;

CREATE OR REPLACE FUNCTION public.notify_new_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pipeline_name TEXT;
  v_source_label TEXT;
  v_assigned_user_name TEXT;
  v_user RECORD;
  v_notified UUID[] := ARRAY[]::UUID[];
  v_is_new_assignment BOOLEAN := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_is_new_assignment := NEW.assigned_user_id IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_is_new_assignment := OLD.assigned_user_id IS NULL AND NEW.assigned_user_id IS NOT NULL;
  END IF;

  IF NOT v_is_new_assignment THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_pipeline_name FROM public.pipelines WHERE id = NEW.pipeline_id;
  SELECT name INTO v_assigned_user_name FROM public.users WHERE id = NEW.assigned_user_id;

  v_source_label := CASE NEW.source
    WHEN 'whatsapp' THEN 'WhatsApp'
    WHEN 'webhook' THEN 'Webhook'
    WHEN 'facebook' THEN 'Facebook Ads'
    WHEN 'instagram' THEN 'Instagram Ads'
    WHEN 'website' THEN 'Website'
    WHEN 'manual' THEN 'Manual'
    WHEN 'meta_ads' THEN 'Meta Ads'
    WHEN 'wordpress' THEN 'WordPress'
    ELSE COALESCE(NEW.source, 'Não informada')
  END;

  -- 1) Assignee: única notificação de atribuição
  PERFORM public.create_notification(
    NEW.assigned_user_id,
    NEW.organization_id,
    'Lead atribuído a você',
    'Lead "' || COALESCE(NEW.name, 'Sem nome') || '" foi atribuído a você. Origem: ' || v_source_label || '. Pipeline: ' || COALESCE(v_pipeline_name, 'Padrão') || '.',
    'lead',
    NEW.id
  );
  v_notified := array_append(v_notified, NEW.assigned_user_id);

  -- 2) Admins (exceto o responsável)
  FOR v_user IN
    SELECT id FROM public.users
    WHERE organization_id = NEW.organization_id
      AND role = 'admin'
      AND NOT (id = ANY(v_notified))
  LOOP
    PERFORM public.create_notification(
      v_user.id,
      NEW.organization_id,
      '🆕 Novo lead no CRM!',
      'Lead "' || COALESCE(NEW.name, 'Sem nome') || '" | Origem: ' || v_source_label || ' | Responsável: ' || COALESCE(v_assigned_user_name, 'Não atribuído') || ' | Pipeline: ' || COALESCE(v_pipeline_name, 'Padrão') || '.',
      'lead',
      NEW.id
    );
    v_notified := array_append(v_notified, v_user.id);
  END LOOP;

  -- 3) Líderes de equipes vinculadas à pipeline (exceto já notificados)
  FOR v_user IN
    SELECT DISTINCT tm.user_id AS uid
    FROM public.team_pipelines tp
    JOIN public.team_members tm ON tm.team_id = tp.team_id
    WHERE tp.pipeline_id = NEW.pipeline_id
      AND tm.is_leader = true
      AND NOT (tm.user_id = ANY(v_notified))
  LOOP
    PERFORM public.create_notification(
      v_user.uid,
      NEW.organization_id,
      '🆕 Novo lead na sua equipe!',
      'Lead "' || COALESCE(NEW.name, 'Sem nome') || '" | Origem: ' || v_source_label || ' | Responsável: ' || COALESCE(v_assigned_user_name, 'Não atribuído') || ' | Pipeline: ' || COALESCE(v_pipeline_name, 'Padrão') || '.',
      'lead',
      NEW.id
    );
    v_notified := array_append(v_notified, v_user.uid);
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_notify_new_lead ON public.leads;
CREATE TRIGGER trigger_notify_new_lead
AFTER INSERT OR UPDATE OF assigned_user_id ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.notify_new_lead();

CREATE OR REPLACE FUNCTION public.notify_lead_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_user_name TEXT;
  v_new_user_name TEXT;
  v_pipeline_name TEXT;
  v_supabase_url TEXT;
  v_service_key TEXT;
  v_message TEXT;
BEGIN
  IF NEW.assigned_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  IF OLD.assigned_user_id IS NOT DISTINCT FROM NEW.assigned_user_id THEN
    RETURN NEW;
  END IF;
  -- Primeira atribuição é tratada por notify_new_lead
  IF OLD.assigned_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_new_user_name FROM public.users WHERE id = NEW.assigned_user_id;
  SELECT name INTO v_old_user_name FROM public.users WHERE id = OLD.assigned_user_id;
  SELECT name INTO v_pipeline_name FROM public.pipelines WHERE id = NEW.pipeline_id;

  INSERT INTO public.notifications (user_id, organization_id, lead_id, title, content, type)
  VALUES (
    NEW.assigned_user_id,
    NEW.organization_id,
    NEW.id,
    'Lead atribuído a você',
    COALESCE(NEW.name, 'Lead') || ' foi transferido de ' || COALESCE(v_old_user_name, 'outro usuário') || ' para você',
    'lead'
  );

  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    v_supabase_url := 'https://iemalzlfnbouobyjwlwi.supabase.co';
  END IF;

  v_message :=
    '🔔 *Lead transferido para você*' || E'\n\n' ||
    '👤 *Lead:* ' || COALESCE(NEW.name, 'Sem nome') || E'\n' ||
    CASE WHEN NEW.phone IS NOT NULL THEN '📱 *Telefone:* ' || NEW.phone || E'\n' ELSE '' END ||
    CASE WHEN v_pipeline_name IS NOT NULL THEN '📊 *Pipeline:* ' || v_pipeline_name || E'\n' ELSE '' END ||
    '🔄 *Transferido de:* ' || COALESCE(v_old_user_name, 'outro usuário') || E'\n' ||
    E'\n' || '🔗 Acesse o CRM para mais detalhes.';

  BEGIN
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/whatsapp-notifier',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(v_service_key, '')
      ),
      body := jsonb_build_object(
        'organization_id', NEW.organization_id,
        'user_id', NEW.assigned_user_id,
        'message', v_message
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Falha ao disparar whatsapp-notifier: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
