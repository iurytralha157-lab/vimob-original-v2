-- Fix the create_default_stages_for_pipeline function to not use organization_id column on stages
CREATE OR REPLACE FUNCTION public.create_default_stages_for_pipeline(p_pipeline_id uuid, p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_stage_id uuid;
  v_cadence_template_id uuid;
  default_stages TEXT[] := ARRAY['Novo Lead', 'Contato Inicial', 'Qualificação', 'Visita Agendada', 'Proposta Enviada', 'Negociação', 'Fechado Ganho', 'Fechado Perdido'];
  stage_colors TEXT[] := ARRAY['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#6366F1', '#EC4899', '#22C55E', '#EF4444'];
  stage_keys TEXT[] := ARRAY['novo_lead', 'contato_inicial', 'qualificacao', 'visita_agendada', 'proposta_enviada', 'negociacao', 'fechado_ganho', 'fechado_perdido'];
  i INTEGER;
BEGIN
  FOR i IN 1..array_length(default_stages, 1) LOOP
    -- Create stage (stages table uses pipeline_id only, not organization_id)
    INSERT INTO stages (pipeline_id, name, color, position, stage_key)
    VALUES (p_pipeline_id, default_stages[i], stage_colors[i], i, stage_keys[i])
    RETURNING id INTO v_new_stage_id;
    
    -- Check if cadence template exists for this stage_key
    SELECT id INTO v_cadence_template_id
    FROM cadence_templates
    WHERE organization_id = p_org_id AND stage_key = stage_keys[i]
    LIMIT 1;
    
    -- If not exists, create it
    IF v_cadence_template_id IS NULL THEN
      INSERT INTO cadence_templates (organization_id, stage_key, name)
      VALUES (p_org_id, stage_keys[i], default_stages[i])
      RETURNING id INTO v_cadence_template_id;
      
      -- Check if default tasks exist for this template using table alias
      IF NOT EXISTS (
        SELECT 1 FROM cadence_tasks_template ctt
        WHERE ctt.cadence_template_id = v_cadence_template_id
      ) THEN
        -- Insert default tasks based on stage
        CASE stage_keys[i]
          WHEN 'novo_lead' THEN
            INSERT INTO cadence_tasks_template (cadence_template_id, title, type, day_offset, position)
            VALUES 
              (v_cadence_template_id, 'Primeiro contato via WhatsApp', 'whatsapp', 0, 1),
              (v_cadence_template_id, 'Ligação de apresentação', 'call', 1, 2);
          WHEN 'contato_inicial' THEN
            INSERT INTO cadence_tasks_template (cadence_template_id, title, type, day_offset, position)
            VALUES 
              (v_cadence_template_id, 'Qualificar interesse', 'call', 0, 1),
              (v_cadence_template_id, 'Enviar material informativo', 'whatsapp', 1, 2);
          WHEN 'qualificacao' THEN
            INSERT INTO cadence_tasks_template (cadence_template_id, title, type, day_offset, position)
            VALUES 
              (v_cadence_template_id, 'Entender necessidades', 'call', 0, 1),
              (v_cadence_template_id, 'Agendar visita', 'task', 2, 2);
          WHEN 'visita_agendada' THEN
            INSERT INTO cadence_tasks_template (cadence_template_id, title, type, day_offset, position)
            VALUES 
              (v_cadence_template_id, 'Confirmar visita', 'whatsapp', 0, 1),
              (v_cadence_template_id, 'Realizar visita', 'meeting', 1, 2);
          WHEN 'proposta_enviada' THEN
            INSERT INTO cadence_tasks_template (cadence_template_id, title, type, day_offset, position)
            VALUES 
              (v_cadence_template_id, 'Follow-up da proposta', 'call', 2, 1),
              (v_cadence_template_id, 'Esclarecer dúvidas', 'whatsapp', 4, 2);
          WHEN 'negociacao' THEN
            INSERT INTO cadence_tasks_template (cadence_template_id, title, type, day_offset, position)
            VALUES 
              (v_cadence_template_id, 'Negociar condições', 'call', 0, 1),
              (v_cadence_template_id, 'Enviar contrato', 'email', 2, 2);
          ELSE
            NULL;
        END CASE;
      END IF;
    END IF;
  END LOOP;
END;
$$;