
-- Add notification session column
ALTER TABLE whatsapp_sessions ADD COLUMN is_notification_session boolean DEFAULT false;

-- Function to ensure only one notification session per organization
CREATE OR REPLACE FUNCTION public.ensure_single_notification_session()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_notification_session = true THEN
    UPDATE whatsapp_sessions 
    SET is_notification_session = false 
    WHERE organization_id = NEW.organization_id 
      AND id != NEW.id 
      AND is_notification_session = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER tr_single_notification_session
  BEFORE INSERT OR UPDATE OF is_notification_session ON whatsapp_sessions
  FOR EACH ROW EXECUTE FUNCTION public.ensure_single_notification_session();
