-- Keep deal_status timestamps consistent even when stage automations mutate NEW.deal_status.
-- Postgres runs same-timing triggers alphabetically, so this trigger name is intentionally late.

CREATE OR REPLACE FUNCTION public.handle_deal_status_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.deal_status = 'won' THEN
    NEW.won_at := COALESCE(NEW.won_at, now());
    NEW.lost_at := NULL;
    NEW.lost_reason := NULL;
  ELSIF NEW.deal_status = 'lost' THEN
    NEW.lost_at := COALESCE(NEW.lost_at, now());
    NEW.won_at := NULL;
  ELSE
    NEW.won_at := NULL;
    NEW.lost_at := NULL;
    NEW.lost_reason := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_deal_status_change ON public.leads;
DROP TRIGGER IF EXISTS zz_trigger_deal_status_timestamp_guard ON public.leads;

CREATE TRIGGER zz_trigger_deal_status_timestamp_guard
BEFORE INSERT OR UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.handle_deal_status_change();

UPDATE public.leads
SET
  won_at = COALESCE(won_at, updated_at, created_at, now()),
  lost_at = NULL,
  lost_reason = NULL
WHERE deal_status = 'won'
  AND won_at IS NULL;

UPDATE public.leads
SET
  lost_at = COALESCE(lost_at, updated_at, created_at, now()),
  won_at = NULL
WHERE deal_status = 'lost'
  AND lost_at IS NULL;

UPDATE public.leads
SET
  won_at = NULL,
  lost_at = NULL,
  lost_reason = NULL
WHERE COALESCE(deal_status, 'open') = 'open'
  AND (
    won_at IS NOT NULL
    OR lost_at IS NOT NULL
    OR lost_reason IS NOT NULL
  );
