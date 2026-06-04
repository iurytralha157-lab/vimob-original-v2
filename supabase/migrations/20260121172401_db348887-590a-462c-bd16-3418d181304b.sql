-- Atualizar create_notification para aceitar organization_id como segundo parâmetro
-- Isso é necessário para as notificações de leads e financeiras

-- Primeiro, criar uma nova versão da função com a assinatura correta
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid, 
  p_organization_id uuid,
  p_title text, 
  p_content text, 
  p_type text DEFAULT 'info'::text,
  p_lead_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id uuid;
BEGIN
  INSERT INTO public.notifications (
    user_id,
    organization_id,
    title,
    content,
    type,
    lead_id,
    is_read
  ) VALUES (
    p_user_id,
    p_organization_id,
    p_title,
    p_content,
    p_type,
    p_lead_id,
    false
  )
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- Atualizar notify_financial_entries para usar a assinatura correta
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
  v_formatted_amount TEXT;
BEGIN
  -- A) Contas que vencem HOJE
  FOR v_entry IN 
    SELECT fe.id, fe.organization_id, fe.type, fe.description, fe.amount, fe.due_date
    FROM public.financial_entries fe
    WHERE fe.due_date = v_today
    AND fe.status = 'pending'
  LOOP
    v_type_label := CASE v_entry.type WHEN 'payable' THEN 'A Pagar' ELSE 'A Receber' END;
    v_formatted_amount := 'R$ ' || TRIM(to_char(v_entry.amount, '999G999G990D00'));
    
    -- Notify all admins of the organization
    FOR v_admin IN 
      SELECT id FROM public.users WHERE organization_id = v_entry.organization_id AND role = 'admin'
    LOOP
      -- Check if already notified today
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = v_admin.id
        AND n.title LIKE '%vence hoje%'
        AND n.content LIKE '%' || v_entry.description || '%'
        AND n.created_at::date = v_today
      ) THEN
        PERFORM public.create_notification(
          v_admin.id,
          v_entry.organization_id,
          '⚠️ Conta vence hoje!',
          v_type_label || ': ' || v_entry.description || ' - ' || v_formatted_amount,
          'commission',
          NULL::uuid
        );
      END IF;
    END LOOP;
  END LOOP;
  
  -- B) Contas VENCIDAS (atrasadas)
  FOR v_entry IN 
    SELECT fe.id, fe.organization_id, fe.type, fe.description, fe.amount, fe.due_date
    FROM public.financial_entries fe
    WHERE fe.due_date < v_today
    AND fe.status = 'pending'
  LOOP
    v_type_label := CASE v_entry.type WHEN 'payable' THEN 'A Pagar' ELSE 'A Receber' END;
    v_formatted_amount := 'R$ ' || TRIM(to_char(v_entry.amount, '999G999G990D00'));
    
    FOR v_admin IN 
      SELECT id FROM public.users WHERE organization_id = v_entry.organization_id AND role = 'admin'
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = v_admin.id
        AND n.title LIKE '%atrasad%'
        AND n.content LIKE '%' || v_entry.description || '%'
        AND n.created_at::date = v_today
      ) THEN
        PERFORM public.create_notification(
          v_admin.id,
          v_entry.organization_id,
          '🚨 Conta em atraso!',
          v_type_label || ': ' || v_entry.description || ' - ' || v_formatted_amount || ' (vencida em ' || to_char(v_entry.due_date, 'DD/MM') || ')',
          'commission',
          NULL::uuid
        );
      END IF;
    END LOOP;
  END LOOP;
  
  -- C) Contas que vencem em 3 dias
  FOR v_entry IN 
    SELECT fe.id, fe.organization_id, fe.type, fe.description, fe.amount, fe.due_date
    FROM public.financial_entries fe
    WHERE fe.due_date = v_today + INTERVAL '3 days'
    AND fe.status = 'pending'
  LOOP
    v_type_label := CASE v_entry.type WHEN 'payable' THEN 'A Pagar' ELSE 'A Receber' END;
    v_formatted_amount := 'R$ ' || TRIM(to_char(v_entry.amount, '999G999G990D00'));
    
    FOR v_admin IN 
      SELECT id FROM public.users WHERE organization_id = v_entry.organization_id AND role = 'admin'
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = v_admin.id
        AND n.title LIKE '%vence em 3 dias%'
        AND n.content LIKE '%' || v_entry.description || '%'
        AND n.created_at::date = v_today
      ) THEN
        PERFORM public.create_notification(
          v_admin.id,
          v_entry.organization_id,
          '📅 Conta vence em 3 dias',
          v_type_label || ': ' || v_entry.description || ' - ' || v_formatted_amount,
          'commission',
          NULL::uuid
        );
      END IF;
    END LOOP;
  END LOOP;
END;
$$;