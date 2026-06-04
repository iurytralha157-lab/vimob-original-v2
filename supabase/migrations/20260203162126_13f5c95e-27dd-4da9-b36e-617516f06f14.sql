-- =================================================
-- HABILITAR pg_net E ATUALIZAR TRIGGERS PARA CHAMAR EDGE FUNCTION DIRETAMENTE
-- =================================================

-- Habilitar a extensão pg_net para chamadas HTTP do banco
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Atualizar função para chamar edge function via HTTP
CREATE OR REPLACE FUNCTION public.trigger_visual_automations_on_stage_change()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
  v_supabase_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Buscar configurações do projeto (via variáveis de ambiente do Supabase)
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  -- Só dispara em UPDATE quando stage_id muda
  IF TG_OP = 'UPDATE' THEN
    IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
      v_payload := jsonb_build_object(
        'event_type', 'lead_stage_changed',
        'data', jsonb_build_object(
          'lead_id', NEW.id,
          'old_stage_id', OLD.stage_id,
          'new_stage_id', NEW.stage_id,
          'organization_id', NEW.organization_id
        )
      );
      
      -- Tentar chamar via pg_net se disponível
      BEGIN
        PERFORM net.http_post(
          url := 'https://iemalzlfnbouobyjwlwi.supabase.co/functions/v1/automation-trigger',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllbWFsemxmbmJvdW9ieWp3bHdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc0NzE3NjUsImV4cCI6MjA1MzA0Nzc2NX0.OoE8wy0rbFcrLzFkv4w6rXpv-4r7xp0bOEh7z_OgAqE'
          ),
          body := v_payload
        );
      EXCEPTION
        WHEN OTHERS THEN
          -- Se falhar, continuar sem erro (melhor não bloquear a transação)
          RAISE WARNING 'Falha ao chamar automation-trigger: %', SQLERRM;
      END;
    END IF;
  END IF;
  
  -- Dispara também em INSERT se tiver stage_id
  IF TG_OP = 'INSERT' AND NEW.stage_id IS NOT NULL THEN
    v_payload := jsonb_build_object(
      'event_type', 'lead_created',
      'data', jsonb_build_object(
        'lead_id', NEW.id,
        'old_stage_id', NULL,
        'new_stage_id', NEW.stage_id,
        'organization_id', NEW.organization_id
      )
    );
    
    BEGIN
      PERFORM net.http_post(
        url := 'https://iemalzlfnbouobyjwlwi.supabase.co/functions/v1/automation-trigger',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllbWFsemxmbmJvdW9ieWp3bHdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc0NzE3NjUsImV4cCI6MjA1MzA0Nzc2NX0.OoE8wy0rbFcrLzFkv4w6rXpv-4r7xp0bOEh7z_OgAqE'
        ),
        body := v_payload
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Falha ao chamar automation-trigger: %', SQLERRM;
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Atualizar função para tags
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
    
    BEGIN
      PERFORM net.http_post(
        url := 'https://iemalzlfnbouobyjwlwi.supabase.co/functions/v1/automation-trigger',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllbWFsemxmbmJvdW9ieWp3bHdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc0NzE3NjUsImV4cCI6MjA1MzA0Nzc2NX0.OoE8wy0rbFcrLzFkv4w6rXpv-4r7xp0bOEh7z_OgAqE'
        ),
        body := v_payload
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Falha ao chamar automation-trigger: %', SQLERRM;
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Atualizar função para lead criado
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
  
  BEGIN
    PERFORM net.http_post(
      url := 'https://iemalzlfnbouobyjwlwi.supabase.co/functions/v1/automation-trigger',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllbWFsemxmbmJvdW9ieWp3bHdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc0NzE3NjUsImV4cCI6MjA1MzA0Nzc2NX0.OoE8wy0rbFcrLzFkv4w6rXpv-4r7xp0bOEh7z_OgAqE'
      ),
      body := v_payload
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Falha ao chamar automation-trigger: %', SQLERRM;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;