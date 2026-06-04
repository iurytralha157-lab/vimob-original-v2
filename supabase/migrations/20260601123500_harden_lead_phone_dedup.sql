-- Consolidate existing duplicate lead cards by organization + normalized phone,
-- then restore the unique guard so new duplicate cards cannot be created.

CREATE OR REPLACE FUNCTION public.normalize_phone(phone_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  cleaned text;
BEGIN
  IF phone_input IS NULL OR btrim(phone_input) = '' THEN
    RETURN NULL;
  END IF;

  cleaned := regexp_replace(phone_input, '[^0-9]', '', 'g');

  IF cleaned = '' THEN
    RETURN NULL;
  END IF;

  IF length(cleaned) > 11 AND substring(cleaned, 1, 2) = '55' THEN
    RETURN cleaned;
  END IF;

  IF length(cleaned) >= 10 AND length(cleaned) <= 11 THEN
    RETURN '55' || cleaned;
  END IF;

  RETURN cleaned;
END;
$function$;

CREATE TEMP TABLE _lead_duplicate_map ON COMMIT DROP AS
WITH candidates AS (
  SELECT
    id,
    organization_id,
    public.normalize_phone(phone) AS phone_key,
    created_at,
    first_value(id) OVER (
      PARTITION BY organization_id, public.normalize_phone(phone)
      ORDER BY created_at ASC, id ASC
    ) AS canonical_id,
    row_number() OVER (
      PARTITION BY organization_id, public.normalize_phone(phone)
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.leads
  WHERE phone IS NOT NULL
    AND btrim(phone) <> ''
    AND public.normalize_phone(phone) IS NOT NULL
    AND public.normalize_phone(phone) <> ''
)
SELECT
  id AS duplicate_id,
  canonical_id,
  organization_id,
  phone_key
FROM candidates
WHERE rn > 1;

CREATE INDEX ON _lead_duplicate_map (duplicate_id);
CREATE INDEX ON _lead_duplicate_map (canonical_id);

WITH merged AS (
  SELECT
    m.canonical_id,
    count(*) AS duplicate_count,
    coalesce(sum(coalesce(d.reentry_count, 0)), 0) AS duplicate_reentry_count,
    max(d.created_at) AS newest_duplicate_created_at,
    max(d.last_entry_at) AS newest_duplicate_entry_at,
    (array_agg(d.name ORDER BY d.updated_at DESC NULLS LAST, d.created_at DESC) FILTER (WHERE d.name IS NOT NULL AND btrim(d.name) <> ''))[1] AS name,
    (array_agg(d.email ORDER BY d.updated_at DESC NULLS LAST, d.created_at DESC) FILTER (WHERE d.email IS NOT NULL AND btrim(d.email) <> ''))[1] AS email,
    (array_agg(d.message ORDER BY d.updated_at DESC NULLS LAST, d.created_at DESC) FILTER (WHERE d.message IS NOT NULL AND btrim(d.message) <> ''))[1] AS message,
    (array_agg(d.initial_message ORDER BY d.updated_at DESC NULLS LAST, d.created_at DESC) FILTER (WHERE d.initial_message IS NOT NULL AND btrim(d.initial_message) <> ''))[1] AS initial_message,
    (array_agg(d.source ORDER BY d.updated_at DESC NULLS LAST, d.created_at DESC) FILTER (WHERE d.source IS NOT NULL AND btrim(d.source) <> ''))[1] AS source,
    (array_agg(d.interest_property_id ORDER BY d.updated_at DESC NULLS LAST, d.created_at DESC) FILTER (WHERE d.interest_property_id IS NOT NULL))[1] AS interest_property_id,
    (array_agg(d.interest_plan_id ORDER BY d.updated_at DESC NULLS LAST, d.created_at DESC) FILTER (WHERE d.interest_plan_id IS NOT NULL))[1] AS interest_plan_id,
    (array_agg(d.valor_interesse ORDER BY d.updated_at DESC NULLS LAST, d.created_at DESC) FILTER (WHERE d.valor_interesse IS NOT NULL))[1] AS valor_interesse
  FROM _lead_duplicate_map m
  JOIN public.leads d ON d.id = m.duplicate_id
  GROUP BY m.canonical_id
)
UPDATE public.leads c
SET
  reentry_count = coalesce(c.reentry_count, 0) + merged.duplicate_count + merged.duplicate_reentry_count,
  last_entry_at = greatest(c.last_entry_at, merged.newest_duplicate_entry_at, merged.newest_duplicate_created_at, now()),
  name = coalesce(nullif(c.name, ''), merged.name, c.name),
  email = coalesce(nullif(c.email, ''), merged.email, c.email),
  message = coalesce(nullif(c.message, ''), merged.message, c.message),
  initial_message = coalesce(nullif(c.initial_message, ''), merged.initial_message, c.initial_message),
  source = coalesce(nullif(c.source, ''), merged.source, c.source),
  interest_property_id = coalesce(c.interest_property_id, merged.interest_property_id),
  interest_plan_id = coalesce(c.interest_plan_id, merged.interest_plan_id),
  valor_interesse = coalesce(c.valor_interesse, merged.valor_interesse),
  updated_at = now()
FROM merged
WHERE c.id = merged.canonical_id;

INSERT INTO public.activities (lead_id, type, content, metadata)
SELECT
  m.canonical_id,
  'lead_merged',
  'Leads duplicados mesclados por telefone',
  jsonb_build_object(
    'phone_key', m.phone_key,
    'duplicate_lead_ids', jsonb_agg(m.duplicate_id ORDER BY m.duplicate_id),
    'merge_reason', 'organization_phone_dedup'
  )
FROM _lead_duplicate_map m
GROUP BY m.canonical_id, m.phone_key;

DELETE FROM public.lead_tags lt
USING _lead_duplicate_map m
WHERE lt.lead_id = m.duplicate_id
  AND EXISTS (
    SELECT 1
    FROM public.lead_tags keep
    WHERE keep.lead_id = m.canonical_id
      AND keep.tag_id = lt.tag_id
  );

DELETE FROM public.lead_property_interests lpi
USING _lead_duplicate_map m
WHERE lpi.lead_id = m.duplicate_id
  AND EXISTS (
    SELECT 1
    FROM public.lead_property_interests keep
    WHERE keep.lead_id = m.canonical_id
      AND keep.property_id = lpi.property_id
  );

DELETE FROM public.lead_attachments la
USING _lead_duplicate_map m
WHERE la.lead_id = m.duplicate_id
  AND la.message_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.lead_attachments keep
    WHERE keep.lead_id = m.canonical_id
      AND keep.message_id = la.message_id
  );

UPDATE public.activities t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.ai_agent_conversations t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.assignments_log t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.automation_executions t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.commissions t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.contracts t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.financial_entries t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.lead_assignment_history t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.lead_attachments t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.lead_entry_events t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.lead_meta t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.lead_pool_history t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.lead_property_interests t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.lead_stage_history t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.lead_tags t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.lead_tasks t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.lead_timeline_events t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.meta_conversations t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.notifications t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.round_robin_logs t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.schedule_events t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.telecom_customers t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.telephony_calls t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;
UPDATE public.whatsapp_conversations t SET lead_id = m.canonical_id FROM _lead_duplicate_map m WHERE t.lead_id = m.duplicate_id;

DELETE FROM public.leads l
USING _lead_duplicate_map m
WHERE l.id = m.duplicate_id;

DROP INDEX IF EXISTS public.leads_org_phone_unique;

CREATE UNIQUE INDEX leads_org_phone_unique
ON public.leads (organization_id, public.normalize_phone(phone))
WHERE phone IS NOT NULL
  AND btrim(phone) <> ''
  AND public.normalize_phone(phone) IS NOT NULL
  AND public.normalize_phone(phone) <> '';
