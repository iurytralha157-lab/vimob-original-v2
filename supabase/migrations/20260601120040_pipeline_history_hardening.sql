CREATE OR REPLACE FUNCTION public.log_lead_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_stage_name text;
  v_new_stage_name text;
  v_old_assignee_name text;
  v_new_assignee_name text;
  v_actor_id uuid;
  v_changed_fields text[];
BEGIN
  v_actor_id := auth.uid();

  IF v_actor_id IS NULL THEN
    v_actor_id := NEW.assigned_user_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
      SELECT name INTO v_old_stage_name FROM public.stages WHERE id = OLD.stage_id;
      SELECT name INTO v_new_stage_name FROM public.stages WHERE id = NEW.stage_id;

      INSERT INTO public.activities (lead_id, user_id, type, content, metadata)
      VALUES (
        NEW.id,
        v_actor_id,
        'stage_change',
        'Movido de "' || COALESCE(v_old_stage_name, 'Desconhecido') || '" para "' || COALESCE(v_new_stage_name, 'Desconhecido') || '"',
        jsonb_build_object(
          'from_stage', v_old_stage_name,
          'to_stage', v_new_stage_name,
          'from_stage_id', OLD.stage_id,
          'to_stage_id', NEW.stage_id,
          'actor_id', v_actor_id
        )
      );
    END IF;

    IF OLD.assigned_user_id IS DISTINCT FROM NEW.assigned_user_id THEN
      SELECT name INTO v_old_assignee_name FROM public.users WHERE id = OLD.assigned_user_id;
      SELECT name INTO v_new_assignee_name FROM public.users WHERE id = NEW.assigned_user_id;

      INSERT INTO public.activities (lead_id, user_id, type, content, metadata)
      VALUES (
        NEW.id,
        v_actor_id,
        'assignee_changed',
        CASE
          WHEN NEW.assigned_user_id IS NULL THEN 'Responsável removido'
          WHEN OLD.assigned_user_id IS NULL THEN 'Atribuído para ' || COALESCE(v_new_assignee_name, 'Desconhecido')
          ELSE 'Responsável alterado de ' || COALESCE(v_old_assignee_name, 'Desconhecido') || ' para ' || COALESCE(v_new_assignee_name, 'Desconhecido')
        END,
        jsonb_build_object(
          'from_user_id', OLD.assigned_user_id,
          'to_user_id', NEW.assigned_user_id,
          'from_user_name', v_old_assignee_name,
          'to_user_name', v_new_assignee_name,
          'actor_id', v_actor_id
        )
      );
    END IF;

    IF OLD.deal_status IS DISTINCT FROM NEW.deal_status THEN
      INSERT INTO public.activities (lead_id, user_id, type, content, metadata)
      VALUES (
        NEW.id,
        v_actor_id,
        'status_change',
        CASE NEW.deal_status
          WHEN 'won' THEN 'Status alterado para Ganho'
          WHEN 'lost' THEN 'Status alterado para Perdido'
          ELSE 'Status alterado para Aberto'
        END,
        jsonb_build_object(
          'from_status', OLD.deal_status,
          'to_status', NEW.deal_status,
          'actor_id', v_actor_id
        )
      );
    END IF;

    v_changed_fields := array_remove(ARRAY[
      CASE WHEN OLD.name IS DISTINCT FROM NEW.name THEN 'name' END,
      CASE WHEN OLD.phone IS DISTINCT FROM NEW.phone THEN 'phone' END,
      CASE WHEN OLD.email IS DISTINCT FROM NEW.email THEN 'email' END,
      CASE WHEN OLD.cargo IS DISTINCT FROM NEW.cargo THEN 'cargo' END,
      CASE WHEN OLD.empresa IS DISTINCT FROM NEW.empresa THEN 'empresa' END,
      CASE WHEN OLD.endereco IS DISTINCT FROM NEW.endereco THEN 'endereco' END,
      CASE WHEN OLD.numero IS DISTINCT FROM NEW.numero THEN 'numero' END,
      CASE WHEN OLD.complemento IS DISTINCT FROM NEW.complemento THEN 'complemento' END,
      CASE WHEN OLD.bairro IS DISTINCT FROM NEW.bairro THEN 'bairro' END,
      CASE WHEN OLD.cidade IS DISTINCT FROM NEW.cidade THEN 'cidade' END,
      CASE WHEN OLD.uf IS DISTINCT FROM NEW.uf THEN 'uf' END,
      CASE WHEN OLD.cep IS DISTINCT FROM NEW.cep THEN 'cep' END,
      CASE WHEN OLD.message IS DISTINCT FROM NEW.message THEN 'message' END,
      CASE WHEN OLD.valor_interesse IS DISTINCT FROM NEW.valor_interesse THEN 'valor_interesse' END,
      CASE WHEN OLD.property_id IS DISTINCT FROM NEW.property_id THEN 'property_id' END,
      CASE WHEN OLD.property_code IS DISTINCT FROM NEW.property_code THEN 'property_code' END,
      CASE WHEN OLD.commission_percentage IS DISTINCT FROM NEW.commission_percentage THEN 'commission_percentage' END,
      CASE WHEN OLD.feedback IS DISTINCT FROM NEW.feedback THEN 'feedback' END,
      CASE WHEN OLD.renda_familiar IS DISTINCT FROM NEW.renda_familiar THEN 'renda_familiar' END,
      CASE WHEN OLD.profissao IS DISTINCT FROM NEW.profissao THEN 'profissao' END,
      CASE WHEN OLD.faixa_valor_imovel IS DISTINCT FROM NEW.faixa_valor_imovel THEN 'faixa_valor_imovel' END
    ], NULL);

    IF array_length(v_changed_fields, 1) > 0 THEN
      INSERT INTO public.activities (lead_id, user_id, type, content, metadata)
      VALUES (
        NEW.id,
        v_actor_id,
        'contact_updated',
        'Informações do lead atualizadas',
        jsonb_build_object(
          'fields_updated', v_changed_fields,
          'actor_id', v_actor_id
        )
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_commission_lead_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid;
BEGIN
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_actor_id := COALESCE(NEW.approved_by, NEW.paid_by, auth.uid(), NEW.user_id);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activities (lead_id, user_id, type, content, metadata)
    VALUES (
      NEW.lead_id,
      v_actor_id,
      'commission_created',
      'Comissão registrada',
      jsonb_build_object(
        'commission_id', NEW.id,
        'status', NEW.status,
        'amount', NEW.amount,
        'base_value', NEW.base_value,
        'percentage', NEW.percentage
      )
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (
       OLD.status IS DISTINCT FROM NEW.status OR
       OLD.amount IS DISTINCT FROM NEW.amount OR
       OLD.base_value IS DISTINCT FROM NEW.base_value OR
       OLD.percentage IS DISTINCT FROM NEW.percentage
     ) THEN
    INSERT INTO public.activities (lead_id, user_id, type, content, metadata)
    VALUES (
      NEW.lead_id,
      v_actor_id,
      'commission_updated',
      'Comissão atualizada',
      jsonb_build_object(
        'commission_id', NEW.id,
        'old_status', OLD.status,
        'new_status', NEW.status,
        'old_amount', OLD.amount,
        'new_amount', NEW.amount,
        'old_base_value', OLD.base_value,
        'new_base_value', NEW.base_value,
        'old_percentage', OLD.percentage,
        'new_percentage', NEW.percentage
      )
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_commission_lead_activity ON public.commissions;
CREATE TRIGGER tr_commission_lead_activity
AFTER INSERT OR UPDATE ON public.commissions
FOR EACH ROW EXECUTE FUNCTION public.log_commission_lead_activity();
