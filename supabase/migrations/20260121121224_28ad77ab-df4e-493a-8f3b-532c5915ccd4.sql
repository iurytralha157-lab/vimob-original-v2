-- =====================================================
-- SISTEMA DE NOTIFICAÇÕES CORRIGIDO
-- =====================================================

-- 1. FUNÇÃO: Notificar quando um NOVO LEAD é criado
-- Notifica: usuário responsável + administradores da org
CREATE OR REPLACE FUNCTION public.notify_new_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_notified_users UUID[] := ARRAY[]::UUID[];
  v_pipeline_name TEXT;
  v_source_label TEXT;
BEGIN
  -- Get pipeline name
  SELECT name INTO v_pipeline_name FROM public.pipelines WHERE id = NEW.pipeline_id;
  
  -- Translate source
  v_source_label := CASE NEW.source
    WHEN 'whatsapp' THEN 'WhatsApp'
    WHEN 'facebook' THEN 'Facebook Ads'
    WHEN 'instagram' THEN 'Instagram Ads'
    WHEN 'website' THEN 'Website'
    WHEN 'manual' THEN 'Manual'
    WHEN 'meta_ads' THEN 'Meta Ads'
    WHEN 'wordpress' THEN 'WordPress'
    ELSE COALESCE(NEW.source, 'Não informada')
  END;
  
  -- 1. Notify the assigned user
  IF NEW.assigned_user_id IS NOT NULL THEN
    PERFORM public.create_notification(
      NEW.assigned_user_id,
      NEW.organization_id,
      '🆕 Novo lead recebido!',
      'Lead "' || NEW.name || '" atribuído a você. Origem: ' || v_source_label || '. Pipeline: ' || COALESCE(v_pipeline_name, 'Padrão') || '.',
      'lead',
      NEW.id
    );
    v_notified_users := array_append(v_notified_users, NEW.assigned_user_id);
  END IF;
  
  -- 2. Notify all admins with different message (showing who received the lead)
  FOR v_user IN 
    SELECT u.id, u.name as user_name FROM public.users u
    WHERE u.organization_id = NEW.organization_id 
    AND u.role = 'admin'
    AND NOT (u.id = ANY(v_notified_users))
  LOOP
    DECLARE
      v_assigned_user_name TEXT;
    BEGIN
      IF NEW.assigned_user_id IS NOT NULL THEN
        SELECT name INTO v_assigned_user_name FROM public.users WHERE id = NEW.assigned_user_id;
      END IF;
      
      PERFORM public.create_notification(
        v_user.id,
        NEW.organization_id,
        '🆕 Novo lead no CRM!',
        'Lead "' || NEW.name || '" | Origem: ' || v_source_label || ' | Atribuído para: ' || COALESCE(v_assigned_user_name, 'Não atribuído') || ' | Pipeline: ' || COALESCE(v_pipeline_name, 'Padrão') || '.',
        'lead',
        NEW.id
      );
    END;
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- 2. FUNÇÃO: Notificar quando lead é REATRIBUÍDO
CREATE OR REPLACE FUNCTION public.notify_lead_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_user_name TEXT;
  v_new_user_name TEXT;
  v_pipeline_name TEXT;
BEGIN
  -- Only trigger if assigned_user_id changed and new value is not null
  IF NEW.assigned_user_id IS NOT NULL AND 
     OLD.assigned_user_id IS NOT NULL AND 
     OLD.assigned_user_id != NEW.assigned_user_id THEN
    
    SELECT name INTO v_old_user_name FROM public.users WHERE id = OLD.assigned_user_id;
    SELECT name INTO v_new_user_name FROM public.users WHERE id = NEW.assigned_user_id;
    SELECT name INTO v_pipeline_name FROM public.pipelines WHERE id = NEW.pipeline_id;
    
    -- Notify the NEW assigned user
    PERFORM public.create_notification(
      NEW.assigned_user_id,
      NEW.organization_id,
      '📥 Lead transferido para você!',
      'O lead "' || NEW.name || '" foi transferido de ' || COALESCE(v_old_user_name, 'outro usuário') || ' para você. Pipeline: ' || COALESCE(v_pipeline_name, 'Padrão') || '.',
      'lead',
      NEW.id
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- 3. FUNÇÃO: Notificar APENAS quando lead é marcado como GANHO (deal_status = 'won')
-- Remove notificações de mudanças de estágio comuns
CREATE OR REPLACE FUNCTION public.notify_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_notified_users UUID[] := ARRAY[]::UUID[];
  v_pipeline_name TEXT;
  v_assigned_user_name TEXT;
BEGIN
  -- ONLY notify when deal_status changes to 'won'
  IF NEW.deal_status = 'won' AND (OLD.deal_status IS NULL OR OLD.deal_status != 'won') THEN
    
    -- Get pipeline name
    SELECT name INTO v_pipeline_name FROM public.pipelines WHERE id = NEW.pipeline_id;
    
    -- Get assigned user name
    IF NEW.assigned_user_id IS NOT NULL THEN
      SELECT name INTO v_assigned_user_name FROM public.users WHERE id = NEW.assigned_user_id;
    END IF;
    
    -- 1. Notify assigned user
    IF NEW.assigned_user_id IS NOT NULL THEN
      PERFORM public.create_notification(
        NEW.assigned_user_id,
        NEW.organization_id,
        '🎉 Parabéns! Lead ganho!',
        'O lead "' || NEW.name || '" foi marcado como GANHO! Ótimo trabalho! Pipeline: ' || COALESCE(v_pipeline_name, 'Padrão') || '.',
        'lead',
        NEW.id
      );
      v_notified_users := array_append(v_notified_users, NEW.assigned_user_id);
    END IF;
    
    -- 2. Notify all admins
    FOR v_user IN 
      SELECT id FROM public.users 
      WHERE organization_id = NEW.organization_id 
      AND role = 'admin'
      AND NOT (id = ANY(v_notified_users))
    LOOP
      PERFORM public.create_notification(
        v_user.id,
        NEW.organization_id,
        '🎉 Lead GANHO!',
        'Lead "' || NEW.name || '" foi marcado como GANHO por ' || COALESCE(v_assigned_user_name, 'usuário') || '! Pipeline: ' || COALESCE(v_pipeline_name, 'Padrão') || '.',
        'lead',
        NEW.id
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 4. FUNÇÃO: Notificar sobre contas financeiras vencendo/vencidas
CREATE OR REPLACE FUNCTION public.notify_financial_entries()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry RECORD;
  v_admin RECORD;
  v_today DATE := CURRENT_DATE;
  v_type_label TEXT;
BEGIN
  -- A) Contas que vencem HOJE
  FOR v_entry IN 
    SELECT fe.*, u.name as created_by_name
    FROM public.financial_entries fe
    LEFT JOIN public.users u ON fe.created_by = u.id
    WHERE fe.due_date = v_today
    AND fe.status = 'pending'
  LOOP
    v_type_label := CASE v_entry.type WHEN 'payable' THEN 'A Pagar' ELSE 'A Receber' END;
    
    -- Notify all admins of the organization
    FOR v_admin IN 
      SELECT id FROM public.users WHERE organization_id = v_entry.organization_id AND role = 'admin'
    LOOP
      -- Check if already notified today
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = v_admin.id
        AND n.title LIKE '%vence hoje%'
        AND n.content LIKE '%' || v_entry.id::text || '%'
        AND n.created_at::date = v_today
      ) THEN
        PERFORM public.create_notification(
          v_admin.id,
          v_entry.organization_id,
          '⚠️ Conta vence hoje!',
          v_type_label || ': ' || v_entry.description || ' - R$ ' || ROUND(v_entry.amount::numeric, 2)::text || ' vence hoje.',
          'commission',
          NULL
        );
      END IF;
    END LOOP;
  END LOOP;
  
  -- B) Contas VENCIDAS (atrasadas)
  FOR v_entry IN 
    SELECT fe.*, u.name as created_by_name
    FROM public.financial_entries fe
    LEFT JOIN public.users u ON fe.created_by = u.id
    WHERE fe.due_date < v_today
    AND fe.status = 'pending'
  LOOP
    v_type_label := CASE v_entry.type WHEN 'payable' THEN 'A Pagar' ELSE 'A Receber' END;
    
    -- Notify all admins
    FOR v_admin IN 
      SELECT id FROM public.users WHERE organization_id = v_entry.organization_id AND role = 'admin'
    LOOP
      -- Check if already notified today about this overdue entry
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = v_admin.id
        AND n.title LIKE '%atrasad%'
        AND n.content LIKE '%' || v_entry.id::text || '%'
        AND n.created_at::date = v_today
      ) THEN
        PERFORM public.create_notification(
          v_admin.id,
          v_entry.organization_id,
          '🚨 Conta em atraso!',
          v_type_label || ': ' || v_entry.description || ' - R$ ' || ROUND(v_entry.amount::numeric, 2)::text || ' está vencida desde ' || to_char(v_entry.due_date, 'DD/MM/YYYY') || '.',
          'commission',
          NULL
        );
      END IF;
    END LOOP;
  END LOOP;
  
  -- C) Contas que vencem em 3 dias (alerta antecipado)
  FOR v_entry IN 
    SELECT fe.*, u.name as created_by_name
    FROM public.financial_entries fe
    LEFT JOIN public.users u ON fe.created_by = u.id
    WHERE fe.due_date = v_today + INTERVAL '3 days'
    AND fe.status = 'pending'
  LOOP
    v_type_label := CASE v_entry.type WHEN 'payable' THEN 'A Pagar' ELSE 'A Receber' END;
    
    FOR v_admin IN 
      SELECT id FROM public.users WHERE organization_id = v_entry.organization_id AND role = 'admin'
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = v_admin.id
        AND n.title LIKE '%vence em 3 dias%'
        AND n.content LIKE '%' || v_entry.id::text || '%'
        AND n.created_at::date = v_today
      ) THEN
        PERFORM public.create_notification(
          v_admin.id,
          v_entry.organization_id,
          '📅 Conta vence em 3 dias',
          v_type_label || ': ' || v_entry.description || ' - R$ ' || ROUND(v_entry.amount::numeric, 2)::text || ' vence em ' || to_char(v_entry.due_date, 'DD/MM/YYYY') || '.',
          'commission',
          NULL
        );
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- 5. Recreate triggers (drop first if exists)
DROP TRIGGER IF EXISTS trigger_notify_new_lead ON public.leads;
DROP TRIGGER IF EXISTS trigger_notify_lead_assigned ON public.leads;
DROP TRIGGER IF EXISTS trigger_notify_stage_change ON public.leads;

CREATE TRIGGER trigger_notify_new_lead
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_lead();

CREATE TRIGGER trigger_notify_lead_assigned
  AFTER UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_lead_assigned();

CREATE TRIGGER trigger_notify_stage_change
  AFTER UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_stage_change();