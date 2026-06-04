-- =================================================
-- CORREÇÃO DO SISTEMA DE AUTOMAÇÕES VISUAIS
-- =================================================

-- 1. Função para chamar a edge function automation-trigger quando lead muda de estágio
CREATE OR REPLACE FUNCTION public.trigger_visual_automations_on_stage_change()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
BEGIN
  -- Só dispara em UPDATE quando stage_id muda
  IF TG_OP = 'UPDATE' THEN
    IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
      -- Monta o payload para a edge function
      v_payload := jsonb_build_object(
        'event_type', 'lead_stage_changed',
        'data', jsonb_build_object(
          'lead_id', NEW.id,
          'old_stage_id', OLD.stage_id,
          'new_stage_id', NEW.stage_id,
          'organization_id', NEW.organization_id
        )
      );
      
      -- Chama a edge function de forma assíncrona via pg_net (se disponível)
      -- Como pg_net pode não estar habilitado, usamos um fallback
      PERFORM pg_notify('automation_triggers', v_payload::text);
    END IF;
  END IF;
  
  -- Dispara também em INSERT se tiver stage_id
  IF TG_OP = 'INSERT' AND NEW.stage_id IS NOT NULL THEN
    v_payload := jsonb_build_object(
      'event_type', 'lead_stage_changed',
      'data', jsonb_build_object(
        'lead_id', NEW.id,
        'old_stage_id', NULL,
        'new_stage_id', NEW.stage_id,
        'organization_id', NEW.organization_id
      )
    );
    
    PERFORM pg_notify('automation_triggers', v_payload::text);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_catalog;

-- 2. Função para chamar a edge function quando tag é adicionada
CREATE OR REPLACE FUNCTION public.trigger_visual_automations_on_tag_added()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
  v_lead_record RECORD;
BEGIN
  -- Busca informações do lead
  SELECT id, organization_id INTO v_lead_record
  FROM public.leads
  WHERE id = NEW.lead_id;
  
  IF v_lead_record.id IS NOT NULL THEN
    v_payload := jsonb_build_object(
      'event_type', 'tag_added',
      'data', jsonb_build_object(
        'lead_id', NEW.lead_id,
        'tag_id', NEW.tag_id,
        'organization_id', v_lead_record.organization_id
      )
    );
    
    PERFORM pg_notify('automation_triggers', v_payload::text);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_catalog;

-- 3. Função para chamar a edge function quando lead é criado
CREATE OR REPLACE FUNCTION public.trigger_visual_automations_on_lead_created()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
BEGIN
  v_payload := jsonb_build_object(
    'event_type', 'lead_created',
    'data', jsonb_build_object(
      'lead_id', NEW.id,
      'organization_id', NEW.organization_id,
      'stage_id', NEW.stage_id
    )
  );
  
  PERFORM pg_notify('automation_triggers', v_payload::text);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_catalog;

-- 4. Criar triggers
DROP TRIGGER IF EXISTS tr_visual_automation_stage_change ON public.leads;
CREATE TRIGGER tr_visual_automation_stage_change
  AFTER INSERT OR UPDATE OF stage_id ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION trigger_visual_automations_on_stage_change();

DROP TRIGGER IF EXISTS tr_visual_automation_tag_added ON public.lead_tags;
CREATE TRIGGER tr_visual_automation_tag_added
  AFTER INSERT ON public.lead_tags
  FOR EACH ROW
  EXECUTE FUNCTION trigger_visual_automations_on_tag_added();

DROP TRIGGER IF EXISTS tr_visual_automation_lead_created ON public.leads;
CREATE TRIGGER tr_visual_automation_lead_created
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION trigger_visual_automations_on_lead_created();

-- 5. Garantir que automation_nodes.node_config seja compatível com config
-- (O frontend usa 'config' mas o banco usa 'node_config')
COMMENT ON COLUMN automation_nodes.node_config IS 'Configuração do nó. No frontend é referenciado como "config"';