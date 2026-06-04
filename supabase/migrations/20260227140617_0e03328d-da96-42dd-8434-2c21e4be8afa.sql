
-- Fix: Remove duplicate lead_created trigger from stage_change function
-- The dedicated trigger_visual_automations_on_lead_created already handles INSERT events
CREATE OR REPLACE FUNCTION public.trigger_visual_automations_on_stage_change()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
BEGIN
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
  END IF;
  
  -- REMOVED: INSERT handling was duplicating lead_created events
  -- The dedicated trigger trigger_visual_automations_on_lead_created handles this
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;
