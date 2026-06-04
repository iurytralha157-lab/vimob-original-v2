-- Create function to notify user when feature request is responded
CREATE OR REPLACE FUNCTION public.notify_feature_request_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status_label TEXT;
BEGIN
  -- Only notify when status changes and admin_response is added
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.user_id IS NOT NULL THEN
    v_status_label := CASE NEW.status
      WHEN 'approved' THEN 'aprovada'
      WHEN 'rejected' THEN 'não aprovada'
      WHEN 'analyzing' THEN 'em análise'
      ELSE NEW.status
    END;
    
    PERFORM public.create_notification(
      NEW.user_id,
      NEW.organization_id,
      '💡 Resposta à sua sugestão',
      'Sua sugestão "' || NEW.title || '" foi marcada como ' || v_status_label || '.' || 
      CASE WHEN NEW.admin_response IS NOT NULL THEN ' Verifique a resposta na Central de Ajuda.' ELSE '' END,
      'info',
      NULL
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER notify_feature_request_response_trigger
AFTER UPDATE ON public.feature_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_feature_request_response();