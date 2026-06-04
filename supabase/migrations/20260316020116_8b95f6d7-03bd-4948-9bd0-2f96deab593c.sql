
-- =============================================
-- FIX: Add organization_id validation to handle_lead_intake
-- Prevents users from other orgs or with NULL org from receiving leads
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_lead_intake(p_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead RECORD;
  v_org_id uuid;
  v_queue RECORD;
  v_next_user_id uuid;
  v_matched_queue_id uuid;
  v_admin_id uuid;
  v_next_user_name text;
BEGIN
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado: %', p_lead_id;
  END IF;
  
  v_org_id := v_lead.organization_id;
  
  IF v_lead.assigned_user_id IS NOT NULL THEN
    RETURN;
  END IF;

  INSERT INTO lead_timeline_events (
    lead_id, organization_id, user_id, event_type, title, description, metadata
  ) VALUES (
    p_lead_id, v_org_id, NULL, 'lead_created',
    'Lead criado',
    'Lead recebido no sistema',
    jsonb_build_object(
      'source', v_lead.source,
      'source_label', CASE v_lead.source
        WHEN 'meta_ads' THEN 'Meta Ads'
        WHEN 'whatsapp' THEN 'WhatsApp'
        WHEN 'webhook' THEN 'Webhook'
        WHEN 'website' THEN 'Site'
        WHEN 'manual' THEN 'Manual'
        ELSE COALESCE(v_lead.source, 'manual')
      END
    )
  );
  
  v_matched_queue_id := pick_round_robin_for_lead(p_lead_id);
  
  IF v_matched_queue_id IS NOT NULL THEN
    SELECT * INTO v_queue 
    FROM round_robins 
    WHERE id = v_matched_queue_id AND is_active = true;
  END IF;
  
  IF v_queue IS NULL THEN
    SELECT id INTO v_admin_id
    FROM users
    WHERE organization_id = v_org_id
      AND role = 'admin'
      AND is_active = true
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_admin_id IS NOT NULL THEN
      SELECT name INTO v_next_user_name FROM users WHERE id = v_admin_id;
      
      UPDATE leads SET
        assigned_user_id = v_admin_id,
        updated_at = now()
      WHERE id = p_lead_id;

      INSERT INTO lead_timeline_events (
        lead_id, organization_id, user_id, event_type, title, description, metadata
      ) VALUES (
        p_lead_id, v_org_id, v_admin_id, 'lead_assigned',
        'Atribuído ao administrador',
        'Nenhuma fila de distribuição ativa. Atribuído a ' || COALESCE(v_next_user_name, 'administrador'),
        jsonb_build_object(
          'destination', 'admin_fallback',
          'reason', 'no_active_queue',
          'assigned_user_id', v_admin_id,
          'assigned_user_name', v_next_user_name
        )
      );

      PERFORM public.notify_whatsapp_on_lead(v_org_id, v_admin_id, v_lead.name, v_lead.source);
    ELSE
      INSERT INTO lead_timeline_events (
        lead_id, organization_id, user_id, event_type, title, description, metadata
      ) VALUES (
        p_lead_id, v_org_id, NULL, 'lead_assigned',
        'Enviado para o Pool',
        'Nenhuma fila ativa e nenhum admin encontrado',
        jsonb_build_object(
          'destination', 'pool',
          'reason', 'no_active_queue_no_admin'
        )
      );
    END IF;
    RETURN;
  END IF;
  
  -- Selecionar próximo usuário com validação de organização
  SELECT rrm.user_id INTO v_next_user_id
  FROM round_robin_members rrm
  JOIN users u ON u.id = rrm.user_id
  WHERE rrm.round_robin_id = v_queue.id
    AND u.is_active = true
    AND u.organization_id = v_org_id  -- NOVA: garante mesma organização
    AND public.is_member_available(rrm.user_id)
  ORDER BY rrm.leads_count ASC NULLS FIRST, rrm.position ASC
  LIMIT 1;
  
  IF v_next_user_id IS NULL THEN
    SELECT id INTO v_admin_id
    FROM users
    WHERE organization_id = v_org_id
      AND role = 'admin'
      AND is_active = true
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_admin_id IS NOT NULL THEN
      SELECT name INTO v_next_user_name FROM users WHERE id = v_admin_id;
      
      UPDATE leads SET
        assigned_user_id = v_admin_id,
        updated_at = now()
      WHERE id = p_lead_id;

      INSERT INTO lead_timeline_events (
        lead_id, organization_id, user_id, event_type, title, description, metadata
      ) VALUES (
        p_lead_id, v_org_id, v_admin_id, 'lead_assigned',
        'Atribuído ao administrador',
        'Fila "' || v_queue.name || '" sem membros disponíveis na escala. Atribuído a ' || COALESCE(v_next_user_name, 'administrador'),
        jsonb_build_object(
          'destination', 'admin_fallback',
          'queue_name', v_queue.name,
          'queue_id', v_queue.id,
          'reason', 'no_available_members',
          'assigned_user_id', v_admin_id,
          'assigned_user_name', v_next_user_name
        )
      );

      PERFORM public.notify_whatsapp_on_lead(v_org_id, v_admin_id, v_lead.name, v_lead.source);
    ELSE
      INSERT INTO lead_timeline_events (
        lead_id, organization_id, user_id, event_type, title, description, metadata
      ) VALUES (
        p_lead_id, v_org_id, NULL, 'lead_assigned',
        'Enviado para o Pool',
        'Fila "' || v_queue.name || '" sem membros disponíveis na escala e nenhum admin encontrado',
        jsonb_build_object(
          'destination', 'pool',
          'queue_name', v_queue.name,
          'queue_id', v_queue.id,
          'reason', 'no_available_members_no_admin'
        )
      );
    END IF;
    RETURN;
  END IF;
  
  SELECT name INTO v_next_user_name FROM users WHERE id = v_next_user_id;
  
  UPDATE leads SET 
    assigned_user_id = v_next_user_id,
    pipeline_id = COALESCE(v_queue.target_pipeline_id, v_lead.pipeline_id),
    stage_id = COALESCE(v_queue.target_stage_id, v_lead.stage_id),
    updated_at = now()
  WHERE id = p_lead_id;
  
  UPDATE round_robin_members 
  SET leads_count = COALESCE(leads_count, 0) + 1
  WHERE round_robin_id = v_queue.id AND user_id = v_next_user_id;
  
  INSERT INTO assignments_log (
    lead_id, organization_id, round_robin_id, assigned_user_id, reason
  ) VALUES (
    p_lead_id, v_org_id, v_queue.id, v_next_user_id, 'round_robin_auto'
  );
  
  INSERT INTO lead_timeline_events (
    lead_id, organization_id, user_id, event_type, title, description, metadata
  ) VALUES (
    p_lead_id, v_org_id, v_next_user_id, 'lead_assigned',
    'Distribuído via "' || v_queue.name || '"',
    'Atribuído a ' || COALESCE(v_next_user_name, 'usuário') || ' pela fila "' || v_queue.name || '"',
    jsonb_build_object(
      'source', v_lead.source,
      'queue_name', v_queue.name,
      'queue_id', v_queue.id,
      'assigned_user_id', v_next_user_id,
      'assigned_user_name', v_next_user_name,
      'distribution_queue_name', v_queue.name,
      'is_initial_distribution', true
    )
  );

  PERFORM public.notify_whatsapp_on_lead(v_org_id, v_next_user_id, v_lead.name, v_lead.source);
  
END;
$function$;

-- =============================================
-- CLEANUP: Remove orphan member from round_robin_members and team_members
-- =============================================
DELETE FROM round_robin_members WHERE id = '3300f1a2-4f62-4e5c-b7b5-92e6b7d0ae88';
DELETE FROM team_members WHERE id = '14526716-b3e3-4cb1-a49e-8bd97c1e481f';

-- =============================================
-- CLEANUP: Reset 22 leads assigned to orphan user and redistribute
-- =============================================
UPDATE leads 
SET assigned_user_id = NULL, assigned_at = NULL, updated_at = now()
WHERE assigned_user_id = '2a6c45cd-0cca-49a0-8db4-fb8d6114ed27'
  AND organization_id = '818394bf-8c57-445e-be2f-b964c2569235';

-- Redistribute each lead via handle_lead_intake
SELECT public.handle_lead_intake('e4bf9ad8-f78e-4cf7-b7f7-a148857991f9');
SELECT public.handle_lead_intake('794e9118-5da6-4f6f-9931-27d7b8a0e990');
SELECT public.handle_lead_intake('8d5ac8d3-7e6f-4264-8e81-c7821bb85159');
SELECT public.handle_lead_intake('8b89a907-1291-49cf-8743-b3d3240dbc57');
SELECT public.handle_lead_intake('6407f5e2-101f-4eb0-a168-a1820f25b6f4');
SELECT public.handle_lead_intake('1e1dfffb-177c-4a6e-99e6-2dd0f58974e6');
SELECT public.handle_lead_intake('8c201ef3-7f6f-4c26-be32-ef51145f137d');
SELECT public.handle_lead_intake('5c54514b-8662-4333-8095-62f3fd5f6814');
SELECT public.handle_lead_intake('6476a869-3881-41e8-88f2-4a0496af5cbb');
SELECT public.handle_lead_intake('704f9c4d-a629-40f6-8bb4-ae7e8993ee88');
SELECT public.handle_lead_intake('59ac22d1-3a77-4a0b-bef7-259cb886ee28');
SELECT public.handle_lead_intake('98556cf1-fb4b-460d-9674-fd3c6836f4d5');
SELECT public.handle_lead_intake('85231258-7511-4f99-9ac2-c661c1456b6c');
SELECT public.handle_lead_intake('1142d40c-46ce-499e-a375-cb7935e07cd0');
SELECT public.handle_lead_intake('632aa355-fed6-45bb-852c-c111dd8a3825');
SELECT public.handle_lead_intake('e7b874a3-b4d2-4551-ba6b-8d615d866be2');
SELECT public.handle_lead_intake('162f3551-5780-47ea-a33e-9bf26bf3b435');
SELECT public.handle_lead_intake('4d15bc23-0dc0-40d0-9ad3-98fedbb3b3bc');
SELECT public.handle_lead_intake('181ffcd1-e8aa-47fc-a3ab-78db8be3428f');
SELECT public.handle_lead_intake('110cc79e-bb96-4df9-987b-f00a03052c4d');
SELECT public.handle_lead_intake('5b20c130-87ce-40a9-b40b-b89084d02f08');
SELECT public.handle_lead_intake('576cf928-fecb-47da-b34f-ae7a0c37779b');
