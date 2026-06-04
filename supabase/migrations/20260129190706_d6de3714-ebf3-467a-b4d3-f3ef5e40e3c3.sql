-- Atualizar função notify_lead_first_assignment para notificar líderes de equipe
CREATE OR REPLACE FUNCTION public.notify_lead_first_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user RECORD;
  v_notified_users UUID[] := ARRAY[]::UUID[];
  v_pipeline_name TEXT;
  v_source_label TEXT;
  v_assigned_user_name TEXT;
BEGIN
  -- Só dispara se assigned_user_id mudou de NULL para um valor (primeira atribuição)
  IF OLD.assigned_user_id IS NULL AND NEW.assigned_user_id IS NOT NULL THEN
    -- Get pipeline name
    SELECT name INTO v_pipeline_name FROM public.pipelines WHERE id = NEW.pipeline_id;
    SELECT name INTO v_assigned_user_name FROM public.users WHERE id = NEW.assigned_user_id;
    
    -- Translate source
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
    
    -- 1. Notificar o usuário atribuído
    PERFORM public.create_notification(
      NEW.assigned_user_id,
      NEW.organization_id,
      '🆕 Novo lead recebido!',
      'Lead "' || NEW.name || '" atribuído a você. Origem: ' || v_source_label || '. Pipeline: ' || COALESCE(v_pipeline_name, 'Padrão') || '.',
      'lead',
      NEW.id
    );
    v_notified_users := array_append(v_notified_users, NEW.assigned_user_id);
    
    -- 2. Notificar todos os admins (exceto já notificados)
    FOR v_user IN 
      SELECT id FROM public.users 
      WHERE organization_id = NEW.organization_id 
      AND role = 'admin'
      AND NOT (id = ANY(v_notified_users))
    LOOP
      PERFORM public.create_notification(
        v_user.id,
        NEW.organization_id,
        '🆕 Novo lead no CRM!',
        'Lead "' || NEW.name || '" | Origem: ' || v_source_label || ' | Atribuído para: ' || COALESCE(v_assigned_user_name, 'Não atribuído') || ' | Pipeline: ' || COALESCE(v_pipeline_name, 'Padrão') || '.',
        'lead',
        NEW.id
      );
      v_notified_users := array_append(v_notified_users, v_user.id);
    END LOOP;
    
    -- 3. Notificar líderes de equipes vinculadas à pipeline do lead
    FOR v_user IN 
      SELECT DISTINCT tm.user_id 
      FROM public.team_pipelines tp
      JOIN public.team_members tm ON tm.team_id = tp.team_id
      WHERE tp.pipeline_id = NEW.pipeline_id
        AND tm.is_leader = true
        AND NOT (tm.user_id = ANY(v_notified_users))
    LOOP
      PERFORM public.create_notification(
        v_user.user_id,
        NEW.organization_id,
        '🆕 Novo lead na sua equipe!',
        'Lead "' || NEW.name || '" | Origem: ' || v_source_label || ' | Atribuído para: ' || COALESCE(v_assigned_user_name, 'Não atribuído') || ' | Pipeline: ' || COALESCE(v_pipeline_name, 'Padrão') || '.',
        'lead',
        NEW.id
      );
      v_notified_users := array_append(v_notified_users, v_user.user_id);
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;