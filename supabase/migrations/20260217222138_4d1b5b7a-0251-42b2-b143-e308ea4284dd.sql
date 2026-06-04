
-- Habilitar pg_net se não estiver
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Função auxiliar para notificar via WhatsApp usando pg_net
CREATE OR REPLACE FUNCTION public.notify_whatsapp_on_lead(
  p_org_id uuid,
  p_user_id uuid,
  p_lead_name text,
  p_source text DEFAULT 'desconhecida'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllbWFsemxmbmJvdW9ieWp3bHdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MjQ1ODYsImV4cCI6MjA4MzUwMDU4Nn0.81N4uCUaIFOm7DHMaHa9Rhh-OoY06j6Ig4AFibzXuQU';
  v_source_label text;
BEGIN
  -- Traduzir source
  v_source_label := CASE p_source
    WHEN 'whatsapp' THEN 'WhatsApp'
    WHEN 'webhook' THEN 'Webhook'
    WHEN 'facebook' THEN 'Facebook Ads'
    WHEN 'instagram' THEN 'Instagram Ads'
    WHEN 'website' THEN 'Website'
    WHEN 'manual' THEN 'Manual'
    WHEN 'meta_ads' THEN 'Meta Ads'
    WHEN 'meta' THEN 'Meta Ads'
    WHEN 'wordpress' THEN 'WordPress'
    WHEN 'api' THEN 'API'
    WHEN 'import' THEN 'Importação'
    ELSE COALESCE(p_source, 'Desconhecida')
  END;

  PERFORM net.http_post(
    url := 'https://iemalzlfnbouobyjwlwi.supabase.co/functions/v1/whatsapp-notifier',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon_key
    ),
    body := jsonb_build_object(
      'organization_id', p_org_id,
      'user_id', p_user_id,
      'message', E'\U0001F195 *Novo Lead Recebido!*\nNome: ' || p_lead_name || E'\nOrigem: ' || v_source_label || E'\nAcesse o CRM para mais detalhes.'
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Falha ao chamar whatsapp-notifier: %', SQLERRM;
END;
$$;

-- Atualizar handle_lead_intake para chamar notify_whatsapp_on_lead após atribuição
CREATE OR REPLACE FUNCTION public.handle_lead_intake(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lead RECORD;
  v_org_id uuid;
  v_queue RECORD;
  v_next_user_id uuid;
  v_matched_queue_id uuid;
  v_admin_id uuid;
BEGIN
  -- Buscar lead
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado: %', p_lead_id;
  END IF;
  
  v_org_id := v_lead.organization_id;
  
  -- Se lead já tem responsável, não fazer nada
  IF v_lead.assigned_user_id IS NOT NULL THEN
    RETURN;
  END IF;
  
  -- Usar a função centralizada de matching
  v_matched_queue_id := pick_round_robin_for_lead(p_lead_id);
  
  -- Buscar dados da fila
  IF v_matched_queue_id IS NOT NULL THEN
    SELECT * INTO v_queue 
    FROM round_robins 
    WHERE id = v_matched_queue_id AND is_active = true;
  END IF;
  
  -- FALLBACK 1: Se não encontrou fila ativa
  IF v_queue IS NULL THEN
    SELECT id INTO v_admin_id
    FROM users
    WHERE organization_id = v_org_id
      AND role = 'admin'
      AND is_active = true
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_admin_id IS NOT NULL THEN
      UPDATE leads SET
        assigned_user_id = v_admin_id,
        updated_at = now()
      WHERE id = p_lead_id;

      INSERT INTO lead_timeline_events (
        lead_id, organization_id, user_id, event_type, title, description, metadata
      ) VALUES (
        p_lead_id, v_org_id, v_admin_id, 'lead_created',
        'Lead criado',
        'Lead atribuído ao administrador (nenhuma fila de distribuição ativa)',
        jsonb_build_object(
          'source', v_lead.source,
          'destination', 'admin_fallback',
          'reason', 'no_active_queue',
          'assigned_user_id', v_admin_id
        )
      );

      -- Notificar via WhatsApp
      PERFORM public.notify_whatsapp_on_lead(v_org_id, v_admin_id, v_lead.name, v_lead.source);
    ELSE
      INSERT INTO lead_timeline_events (
        lead_id, organization_id, user_id, event_type, title, description, metadata
      ) VALUES (
        p_lead_id, v_org_id, NULL, 'lead_created',
        'Lead criado',
        'Lead enviado para o Pool - nenhuma fila ativa e nenhum admin encontrado',
        jsonb_build_object(
          'source', v_lead.source,
          'destination', 'pool',
          'reason', 'no_active_queue_no_admin'
        )
      );
    END IF;
    RETURN;
  END IF;
  
  -- Selecionar próximo usuário usando leads_count e position
  SELECT rrm.user_id INTO v_next_user_id
  FROM round_robin_members rrm
  JOIN users u ON u.id = rrm.user_id
  WHERE rrm.round_robin_id = v_queue.id
    AND u.is_active = true
  ORDER BY rrm.leads_count ASC NULLS FIRST, rrm.position ASC
  LIMIT 1;
  
  -- FALLBACK 2: Se fila não tem membros ativos
  IF v_next_user_id IS NULL THEN
    SELECT id INTO v_admin_id
    FROM users
    WHERE organization_id = v_org_id
      AND role = 'admin'
      AND is_active = true
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_admin_id IS NOT NULL THEN
      UPDATE leads SET
        assigned_user_id = v_admin_id,
        updated_at = now()
      WHERE id = p_lead_id;

      INSERT INTO lead_timeline_events (
        lead_id, organization_id, user_id, event_type, title, description, metadata
      ) VALUES (
        p_lead_id, v_org_id, v_admin_id, 'lead_created',
        'Lead criado',
        'Lead atribuído ao administrador (fila "' || v_queue.name || '" sem membros ativos)',
        jsonb_build_object(
          'source', v_lead.source,
          'destination', 'admin_fallback',
          'queue_name', v_queue.name,
          'reason', 'no_active_members',
          'assigned_user_id', v_admin_id
        )
      );

      -- Notificar via WhatsApp
      PERFORM public.notify_whatsapp_on_lead(v_org_id, v_admin_id, v_lead.name, v_lead.source);
    ELSE
      INSERT INTO lead_timeline_events (
        lead_id, organization_id, user_id, event_type, title, description, metadata
      ) VALUES (
        p_lead_id, v_org_id, NULL, 'lead_created',
        'Lead criado',
        'Lead enviado para o Pool - fila sem membros ativos e nenhum admin encontrado',
        jsonb_build_object(
          'source', v_lead.source,
          'destination', 'pool',
          'queue_name', v_queue.name,
          'reason', 'no_active_members_no_admin'
        )
      );
    END IF;
    RETURN;
  END IF;
  
  -- Atribuir lead ao usuário selecionado (fluxo normal Round Robin)
  UPDATE leads SET 
    assigned_user_id = v_next_user_id,
    pipeline_id = COALESCE(v_queue.target_pipeline_id, v_lead.pipeline_id),
    stage_id = COALESCE(v_queue.target_stage_id, v_lead.stage_id),
    updated_at = now()
  WHERE id = p_lead_id;
  
  -- Incrementar contador do membro
  UPDATE round_robin_members 
  SET leads_count = COALESCE(leads_count, 0) + 1
  WHERE round_robin_id = v_queue.id AND user_id = v_next_user_id;
  
  -- Registrar atribuição no log
  INSERT INTO assignments_log (
    lead_id, organization_id, round_robin_id, assigned_user_id, reason
  ) VALUES (
    p_lead_id, v_org_id, v_queue.id, v_next_user_id, 'round_robin_auto'
  );
  
  -- Registrar na timeline
  INSERT INTO lead_timeline_events (
    lead_id, organization_id, user_id, event_type, title, description, metadata
  ) VALUES (
    p_lead_id, v_org_id, v_next_user_id, 'lead_created',
    'Lead criado',
    'Lead criado e distribuído automaticamente via Round Robin',
    jsonb_build_object(
      'source', v_lead.source,
      'queue_name', v_queue.name,
      'queue_id', v_queue.id,
      'assigned_user_id', v_next_user_id
    )
  );

  -- Notificar via WhatsApp
  PERFORM public.notify_whatsapp_on_lead(v_org_id, v_next_user_id, v_lead.name, v_lead.source);
  
END;
$$;
