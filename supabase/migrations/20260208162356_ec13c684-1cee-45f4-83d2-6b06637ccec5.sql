-- Drop existing function first to change signature
DROP FUNCTION IF EXISTS public.handle_lead_intake(uuid);

-- Recreate with fix: add organization_id and title to lead_timeline_events INSERTs
CREATE OR REPLACE FUNCTION public.handle_lead_intake(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_org_settings RECORD;
  v_round_robin RECORD;
  v_next_user_id uuid;
  v_default_pipeline_id uuid;
  v_first_stage_id uuid;
  v_source_label text;
  v_event_metadata jsonb;
BEGIN
  -- Get lead details
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  
  IF v_lead IS NULL THEN
    RAISE EXCEPTION 'Lead not found: %', p_lead_id;
  END IF;

  -- Determine source label for timeline
  v_source_label := CASE 
    WHEN v_lead.source = 'meta' THEN 'Meta Ads'
    WHEN v_lead.source = 'webhook' THEN 'Webhook'
    WHEN v_lead.source = 'whatsapp' THEN 'WhatsApp'
    WHEN v_lead.source = 'site' THEN 'Site'
    WHEN v_lead.source = 'manual' THEN 'cadastro manual'
    ELSE COALESCE(v_lead.source, 'sistema')
  END;

  -- Build event metadata
  v_event_metadata := jsonb_build_object(
    'source', v_lead.source,
    'source_label', v_source_label,
    'meta_lead_id', v_lead.meta_lead_id,
    'meta_form_id', v_lead.meta_form_id
  );

  -- Register lead_created event with ALL required columns
  INSERT INTO lead_timeline_events (
    organization_id, lead_id, event_type, user_id, title, metadata
  )
  VALUES (
    v_lead.organization_id,
    p_lead_id, 
    'lead_created', 
    NULL,
    'Lead criado via ' || v_source_label,
    v_event_metadata
  );

  -- Register activity
  INSERT INTO activities (lead_id, type, content, user_id, metadata)
  VALUES (
    p_lead_id,
    'lead_created',
    'Lead criado via ' || v_source_label,
    NULL,
    v_event_metadata
  );

  -- If lead already has pipeline and stage assigned, skip distribution
  IF v_lead.pipeline_id IS NOT NULL AND v_lead.stage_id IS NOT NULL THEN
    RETURN;
  END IF;

  -- Get organization settings
  SELECT * INTO v_org_settings 
  FROM organizations 
  WHERE id = v_lead.organization_id;

  -- Find applicable round robin for this source
  SELECT rr.* INTO v_round_robin
  FROM round_robins rr
  WHERE rr.organization_id = v_lead.organization_id
    AND rr.is_active = true
    AND rr.source_type = v_lead.source
  ORDER BY rr.created_at DESC
  LIMIT 1;

  -- If no source-specific round robin, try default (null source_type)
  IF v_round_robin IS NULL THEN
    SELECT rr.* INTO v_round_robin
    FROM round_robins rr
    WHERE rr.organization_id = v_lead.organization_id
      AND rr.is_active = true
      AND rr.source_type IS NULL
    ORDER BY rr.created_at DESC
    LIMIT 1;
  END IF;

  -- If no round robin found, leave lead unassigned
  IF v_round_robin IS NULL THEN
    RETURN;
  END IF;

  -- Get pipeline and first stage from round robin
  v_default_pipeline_id := v_round_robin.pipeline_id;
  
  SELECT id INTO v_first_stage_id
  FROM stages
  WHERE pipeline_id = v_default_pipeline_id
  ORDER BY position ASC
  LIMIT 1;

  -- Get next user from round robin queue
  SELECT user_id INTO v_next_user_id
  FROM round_robin_members
  WHERE round_robin_id = v_round_robin.id
    AND is_active = true
    AND (
      is_available = true 
      OR is_available IS NULL
    )
  ORDER BY last_assigned_at ASC NULLS FIRST, position ASC
  LIMIT 1;

  -- Update lead with pipeline, stage, and optionally user
  UPDATE leads
  SET 
    pipeline_id = v_default_pipeline_id,
    stage_id = v_first_stage_id,
    assigned_user_id = v_next_user_id,
    updated_at = now()
  WHERE id = p_lead_id;

  -- If user was assigned, update round robin tracking
  IF v_next_user_id IS NOT NULL THEN
    -- Update last_assigned_at for the member
    UPDATE round_robin_members
    SET last_assigned_at = now()
    WHERE round_robin_id = v_round_robin.id
      AND user_id = v_next_user_id;

    -- Log assignment
    INSERT INTO assignments_log (
      lead_id, 
      assigned_user_id, 
      round_robin_id, 
      organization_id,
      reason,
      assigned_at
    )
    VALUES (
      p_lead_id,
      v_next_user_id,
      v_round_robin.id,
      v_lead.organization_id,
      'Round Robin automático',
      now()
    );

    -- Record timeline event for assignment with ALL required columns
    INSERT INTO lead_timeline_events (
      organization_id, lead_id, event_type, user_id, title, metadata
    )
    VALUES (
      v_lead.organization_id,
      p_lead_id,
      'assignee_changed',
      NULL,
      'Distribuído via Round Robin',
      jsonb_build_object(
        'new_assignee_id', v_next_user_id,
        'round_robin_id', v_round_robin.id,
        'round_robin_name', v_round_robin.name,
        'distribution_type', 'automatic'
      )
    );
  END IF;

END;
$$;